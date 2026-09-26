import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Match, MatchResultCase, Prisma, ResultIncidentType } from '@prisma/client';
import type { MatchResultFinalizedPayload } from '@khoaluantn/shared';
import type { PrivateObjectStorageClient } from '@khoaluantn/object-storage';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';
import { writeResultNotification } from '../lib/notificationOutbox.js';
import { prisma } from '../lib/prisma.js';
import type { AccountClient } from '../clients/account.js';
import type { VenueBookingClient } from '../clients/venueBooking.js';
import {
  RATIO_FROM_DB, allocateResultReserve, calculateMatchFunding, losingSide, objectionOpenUntil, type MatchOutcome,
} from './matchRules.js';
import { participantIdentity } from './matches.js';
import { reserveRatedResults } from './ratedResults.js';
import { DECLARATION_WINDOW_MS, adminReviewNotification, lockMatch, notifyRoster, openResultDispute, resultTeams } from './matchResults.js';
import { inspectResultEvidence, insertResultEvidence, type ResultEvidenceItem } from './resultEvidence.js';

type Tx = Prisma.TransactionClient;
const HOUR_MS = 60 * 60_000;
export const TEAM_GRACE_MS = HOUR_MS;
export const INCIDENT_WINDOW_MS = 12 * HOUR_MS;
export const NO_SHOW_AFTER_START_MS = 15 * 60_000;

/** Ghi kết quả final và event duy nhất; dùng chung cho luồng không tranh chấp và quyết định Admin. */
export async function writeResultFinal(tx: Tx, resultCase: MatchResultCase, outcome: MatchOutcome, decisionId: string, now: Date) {
  await tx.matchResultCase.update({
    where: { id: resultCase.id },
    data: { status: 'final', outcome, finalizedAt: now, closedAt: now, version: { increment: 1 } },
  });
  await writeOutbox(tx, {
    aggregateType: 'Match', aggregateId: resultCase.matchId, eventType: 'MatchResultFinalized',
    payload: { matchId: resultCase.matchId, decisionId, outcome, finalizedAt: now.toISOString() } satisfies MatchResultFinalizedPayload,
  });
  const match = await tx.match.findUniqueOrThrow({
    where: { id: resultCase.matchId }, select: { id: true, organizerUserId: true, mode: true, discipline: true },
  });
  const teams = await resultTeams(tx, match);
  await reserveRatedResults(tx, match, teams, outcome, now);
  await writeResultNotification(tx, {
    recipients: Object.values(teams).flat().map((userId) => ({ type: 'user' as const, userId, targetRole: 'player' as const })),
    kind: 'match.result.final', title: 'Kết quả kèo đã chốt',
    body: 'Kết quả kèo đã được chốt. Khoản giữ cho kết quả sẽ được phân bổ vào số dư có thể rút.',
    matchId: resultCase.matchId, caseId: resultCase.id, actionKind: 'match.result.view',
  });
}

/**
 * BR-CM-32/33: chốt kết quả không tranh chấp đúng một lần. Chỉ provisional (theo kết quả tạm)
 * hoặc incident_window (NO_RESULT); trạng thái tranh chấp/provider/Admin bị chặn cứng.
 * Caller giữ khóa kèo và đã kiểm tra điều kiện thời gian.
 */
async function finalizeUndisputedInTx(tx: Tx, resultCase: MatchResultCase, now: Date): Promise<boolean> {
  if (resultCase.status === 'provisional' && resultCase.outcome) {
    await writeResultFinal(tx, resultCase, resultCase.outcome, resultCase.id, now);
    return true;
  }
  if (resultCase.status === 'incident_window') {
    await writeResultFinal(tx, resultCase, 'NO_RESULT', resultCase.id, now);
    return true;
  }
  return false;
}

export async function finalizeUndisputedResult(caseId: string, now = new Date()): Promise<boolean> {
  const target = await prisma.matchResultCase.findUnique({ where: { id: caseId }, select: { matchId: true } });
  if (!target) return false;
  return prisma.$transaction(async (tx) => {
    await lockMatch(tx, target.matchId);
    const resultCase = await tx.matchResultCase.findUniqueOrThrow({ where: { id: caseId } });
    const until = resultCase.status === 'incident_window' ? resultCase.incidentDeadlineAt : objectionOpenUntil(resultCase);
    const due = until !== null && until <= now;
    return due && finalizeUndisputedInTx(tx, resultCase, now);
  });
}

async function lockedCase(tx: Tx, matchId: string, userId: string) {
  await lockMatch(tx, matchId);
  const match = await tx.match.findUnique({ where: { id: matchId }, include: { resultCase: true } });
  if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
  const teams = await resultTeams(tx, match);
  if (!Object.values(teams).flat().includes(userId)) {
    throw new AppError(403, 'RESULT_ROSTER_ONLY', 'Chỉ người trong kèo được thao tác với kết quả.');
  }
  return { match, teams, resultCase: match.resultCase };
}

function assertObjectionOpen(resultCase: MatchResultCase | null, now: Date): asserts resultCase is MatchResultCase {
  const until = resultCase && objectionOpenUntil(resultCase);
  if (!resultCase || resultCase.status !== 'provisional' || !until || now >= until) {
    throw new AppError(409, 'RESULT_RESPONSE_CLOSED', 'Kết quả không còn nhận phản hồi.');
  }
}

/** BR-CM-31: đơn chốt sớm khi đối thủ xác nhận; đôi cần cả hai người đội thua hoặc hết grace 60 phút. */
export async function confirmResult(matchId: string, userId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const { match, teams, resultCase } = await lockedCase(tx, matchId, userId);
    assertObjectionOpen(resultCase, now);
    const losers = teams[losingSide(resultCase.outcome)!];
    if (!losers.includes(userId)) throw new AppError(403, 'RESULT_CONFIRM_LOSER_ONLY', 'Chỉ bên thua được xác nhận kết quả.');
    const confirmed = await tx.resultResponse.findMany({ where: { caseId: resultCase.id, kind: 'confirm' }, select: { userId: true } });
    if (confirmed.some((response) => response.userId === userId)) {
      throw new AppError(409, 'RESULT_ALREADY_CONFIRMED', 'Bạn đã xác nhận kết quả này.');
    }
    await tx.resultResponse.create({ data: { caseId: resultCase.id, userId, kind: 'confirm', createdAt: now } });
    if (confirmed.length + 1 >= losers.length) {
      await finalizeUndisputedInTx(tx, resultCase, now);
      return { status: 'final' as const };
    }
    await tx.matchResultCase.update({
      where: { id: resultCase.id },
      data: { teamGraceDeadlineAt: new Date(now.getTime() + TEAM_GRACE_MS), version: { increment: 1 } },
    });
    await notifyRoster(tx, match, resultCase.id, 'match.result.confirmed_partial', 'Một người bên thua đã đồng ý kết quả',
      'Người còn lại của đội thua có 60 phút để đồng ý hoặc khiếu nại; quá hạn kết quả sẽ được chốt.');
    return { status: 'provisional' as const };
  });
}

export async function objectResult(
  storage: PrivateObjectStorageClient,
  input: { matchId: string; userId: string; reason: string; evidence: ResultEvidenceItem[] },
  now = new Date(),
) {
  const evidence = await inspectResultEvidence(storage, input.userId, input.evidence);
  return prisma.$transaction(async (tx) => {
    const { match, teams, resultCase } = await lockedCase(tx, input.matchId, input.userId);
    assertObjectionOpen(resultCase, now);
    const response = await tx.resultResponse.create({
      data: { caseId: resultCase.id, userId: input.userId, kind: 'object', reason: input.reason, createdAt: now },
    });
    await insertResultEvidence(tx, { matchId: match.id, ownerUserId: input.userId, evidence, responseId: response.id });
    await openResultDispute(tx, resultCase, match, Object.values(teams).flat(), now);
    return { responseId: response.id };
  });
}

/** BR-CM-34/35: sự cố luôn mở tranh chấp, không tự tạo người thắng; no-show chỉ từ startAt + 15 phút. */
export async function reportIncident(
  storage: PrivateObjectStorageClient,
  input: { matchId: string; userId: string; type: ResultIncidentType; description: string; evidence: ResultEvidenceItem[] },
  now = new Date(),
) {
  const evidence = await inspectResultEvidence(storage, input.userId, input.evidence);
  return prisma.$transaction(async (tx) => {
    const { match, teams } = await lockedCase(tx, input.matchId, input.userId);
    const resultCase = await incidentCase(tx, match, now);
    if (input.type === 'no_show' && (!match.startAt || now.getTime() < match.startAt.getTime() + NO_SHOW_AFTER_START_MS)) {
      throw new AppError(409, 'RESULT_NO_SHOW_TOO_EARLY', 'Chỉ báo vắng mặt sau giờ bắt đầu 15 phút.');
    }
    const response = await tx.resultResponse.create({
      data: {
        caseId: resultCase.id, userId: input.userId, kind: 'incident', incidentType: input.type,
        reason: input.description, createdAt: now,
      },
    });
    await insertResultEvidence(tx, { matchId: match.id, ownerUserId: input.userId, evidence, responseId: response.id });
    await openResultDispute(tx, resultCase, match, Object.values(teams).flat(), now);
    return { responseId: response.id };
  });
}

/** Sự cố trước/trong trận mở hồ sơ sớm cho kèo đã khóa; sau đó chỉ khi hồ sơ còn nhận sự cố. */
async function incidentCase(tx: Tx, match: Match & { resultCase: MatchResultCase | null }, now: Date) {
  let resultCase = match.resultCase;
  if (!resultCase && match.endAt && (match.status === 'confirmed' || match.status === 'completed')) {
    resultCase = await tx.matchResultCase.create({
      data: { matchId: match.id, declarationDeadlineAt: new Date(match.endAt.getTime() + DECLARATION_WINDOW_MS) },
    });
  }
  const open = resultCase && (
    (resultCase.status === 'declaration_open' && now < resultCase.declarationDeadlineAt)
    || (resultCase.status === 'provisional' && now < (objectionOpenUntil(resultCase) ?? now))
    || (resultCase.status === 'incident_window' && resultCase.incidentDeadlineAt !== null && now < resultCase.incidentDeadlineAt)
  );
  if (!resultCase || !open) throw new AppError(409, 'RESULT_INCIDENT_CLOSED', 'Hồ sơ kết quả không còn nhận báo sự cố.');
  return resultCase;
}

/** Bổ sung ảnh khi hồ sơ còn mở (chưa final). */
export async function supplementResultEvidence(
  storage: PrivateObjectStorageClient,
  input: { matchId: string; userId: string; evidence: ResultEvidenceItem[] },
) {
  const evidence = await inspectResultEvidence(storage, input.userId, input.evidence);
  await prisma.$transaction(async (tx) => {
    await lockedCase(tx, input.matchId, input.userId);
    await insertResultEvidence(tx, { matchId: input.matchId, ownerUserId: input.userId, evidence });
  });
}

/** Scheduler idempotent: mọi chuyển trạng thái đều kiểm tra lại dưới khóa kèo. */
export async function sweepResultDeadlines(now = new Date(), matchIds?: string[]): Promise<number> {
  const scope = matchIds ? { matchId: { in: matchIds } } : {};
  await sweepResultReminders(now, matchIds);
  const declarationExpired = await prisma.matchResultCase.findMany({
    where: { ...scope, status: 'declaration_open', declarationDeadlineAt: { lte: now } }, select: { id: true, matchId: true }, take: 100,
  });
  for (const target of declarationExpired) {
    await prisma.$transaction(async (tx) => {
      await lockMatch(tx, target.matchId);
      const resultCase = await tx.matchResultCase.findUniqueOrThrow({ where: { id: target.id } });
      if (resultCase.status !== 'declaration_open' || resultCase.declarationDeadlineAt > now) return;
      // BR-CM-33: NO_RESULT tạm, thêm 12 giờ báo sự cố; tiền tiếp tục khóa.
      await tx.matchResultCase.update({
        where: { id: resultCase.id },
        data: {
          status: 'incident_window', outcome: 'NO_RESULT',
          incidentDeadlineAt: new Date(resultCase.declarationDeadlineAt.getTime() + INCIDENT_WINDOW_MS), version: { increment: 1 },
        },
      });
      const match = await tx.match.findUniqueOrThrow({ where: { id: target.matchId }, select: { id: true, organizerUserId: true } });
      await notifyRoster(tx, match, resultCase.id, 'match.result.incident_window', 'Chưa có ai khai kết quả',
        'Hết hạn khai kết quả. Bạn có 12 giờ để báo sự cố; nếu không, trận được ghi nhận là không có kết quả.');
    });
  }
  const due = await prisma.matchResultCase.findMany({
    where: {
      ...scope,
      OR: [
        { status: 'incident_window', incidentDeadlineAt: { lte: now } },
        { status: 'provisional', teamGraceDeadlineAt: { lte: now } },
        { status: 'provisional', teamGraceDeadlineAt: null, objectionDeadlineAt: { lte: now } },
      ],
    },
    select: { id: true },
    take: 100,
  });
  let finalized = 0;
  for (const target of due) if (await finalizeUndisputedResult(target.id, now)) finalized += 1;
  return declarationExpired.length + finalized;
}

export const RESULT_REMINDER_BEFORE_MS = 2 * HOUR_MS;

/** Spec §11: nhắc sắp hết hạn khai báo (cả roster) và phản hồi (bên thua) đúng một lần, 2 giờ trước hạn. */
export async function sweepResultReminders(now = new Date(), matchIds?: string[]) {
  const scope = matchIds ? { matchId: { in: matchIds } } : {};
  const soon = new Date(now.getTime() + RESULT_REMINDER_BEFORE_MS);
  const cases = await prisma.matchResultCase.findMany({
    where: {
      ...scope,
      OR: [
        { status: 'declaration_open', declarationReminderAt: null, declarationDeadlineAt: { gt: now, lte: soon } },
        { status: 'provisional', responseReminderAt: null, objectionDeadlineAt: { gt: now, lte: soon } },
      ],
    },
    select: { id: true, matchId: true },
    take: 100,
  });
  for (const target of cases) {
    await prisma.$transaction(async (tx) => {
      await lockMatch(tx, target.matchId);
      const resultCase = await tx.matchResultCase.findUniqueOrThrow({ where: { id: target.id } });
      const match = await tx.match.findUniqueOrThrow({ where: { id: target.matchId }, select: { id: true, organizerUserId: true } });
      if (resultCase.status === 'declaration_open' && !resultCase.declarationReminderAt) {
        await tx.matchResultCase.update({ where: { id: resultCase.id }, data: { declarationReminderAt: now } });
        await notifyRoster(tx, match, resultCase.id, 'match.result.declaration_reminder', 'Sắp hết hạn khai kết quả',
          'Còn dưới 2 giờ để khai tỷ số kèm ảnh bằng chứng. Quá hạn, trận chỉ còn 12 giờ để báo sự cố.');
      } else if (resultCase.status === 'provisional' && !resultCase.responseReminderAt && resultCase.outcome) {
        await tx.matchResultCase.update({ where: { id: resultCase.id }, data: { responseReminderAt: now } });
        const losers = (await resultTeams(tx, match))[losingSide(resultCase.outcome)!];
        await writeResultNotification(tx, {
          recipients: losers.map((userId) => ({ type: 'user' as const, userId, targetRole: 'player' as const })),
          kind: 'match.result.response_reminder', title: 'Sắp hết hạn phản hồi kết quả',
          body: 'Còn dưới 2 giờ để đồng ý hoặc khiếu nại kết quả tạm; quá hạn kết quả sẽ được chốt.',
          matchId: match.id, caseId: resultCase.id, actionKind: 'match.result.view',
        });
      }
    });
  }
  return cases.length;
}

// ---- Task 13: provider đề xuất (không ràng buộc) và Admin quyết định cuối (BR-CM-37..42) ----

export const ADMIN_SLA_MS = 48 * HOUR_MS;
const REVIEW_REMINDER_MS = 24 * HOUR_MS;

const reviewInclude = {
  match: true,
  claims: { orderBy: { createdAt: 'asc' }, include: { sets: { orderBy: { position: 'asc' } }, evidence: { select: { id: true } } } },
  responses: { orderBy: { createdAt: 'asc' }, include: { evidence: { select: { id: true } } } },
  evidence: { where: { claimId: null, responseId: null }, orderBy: { createdAt: 'asc' }, select: { id: true, ownerUserId: true } },
  recommendations: { orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.MatchResultCaseInclude;
type ReviewCase = Prisma.MatchResultCaseGetPayload<{ include: typeof reviewInclude }>;
export type ResultCaseStatusFilter = MatchResultCase['status'];

function page(input: { page?: number; pageSize?: number }) {
  const pageNumber = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  return { page: pageNumber, pageSize, skip: (pageNumber - 1) * pageSize };
}

function adminOverdue(resultCase: MatchResultCase, now: Date) {
  return resultCase.status === 'admin_review' && resultCase.adminReviewStartedAt !== null
    && now.getTime() >= resultCase.adminReviewStartedAt.getTime() + ADMIN_SLA_MS;
}

function queueItem(resultCase: MatchResultCase & { match: Match }, now: Date) {
  return {
    caseId: resultCase.id,
    matchId: resultCase.matchId,
    status: resultCase.status,
    version: resultCase.version,
    discipline: resultCase.match.discipline,
    mode: resultCase.match.mode,
    startAt: resultCase.match.startAt?.toISOString() ?? null,
    endAt: resultCase.match.endAt?.toISOString() ?? null,
    providerDeadlineAt: resultCase.providerDeadlineAt?.toISOString() ?? null,
    adminReviewStartedAt: resultCase.adminReviewStartedAt?.toISOString() ?? null,
    adminOverdue: adminOverdue(resultCase, now),
  };
}

async function listQueue(where: Prisma.MatchResultCaseWhereInput, input: { page?: number; pageSize?: number }, now: Date) {
  const paging = page(input);
  const [rows, total] = await Promise.all([
    prisma.matchResultCase.findMany({ where, include: { match: true }, orderBy: { createdAt: 'asc' }, skip: paging.skip, take: paging.pageSize }),
    prisma.matchResultCase.count({ where }),
  ]);
  return { items: rows.map((row) => queueItem(row, now)), total, page: paging.page, pageSize: paging.pageSize };
}

/** Provider chỉ thấy hồ sơ tại sân mình đã vào bước provider (hồ sơ có provider trong roster bị bỏ qua từ đầu). */
export function listProviderResultCases(
  providerUserId: string, input: { status?: ResultCaseStatusFilter; page?: number; pageSize?: number }, now = new Date(),
) {
  return listQueue({
    match: { providerUserId }, providerDeadlineAt: { not: null }, status: input.status ?? 'provider_review',
  }, input, now);
}

export function listAdminResultCases(input: { status?: ResultCaseStatusFilter; page?: number; pageSize?: number }, now = new Date()) {
  return listQueue({ status: input.status ?? 'admin_review' }, input, now);
}

async function reviewDetail(
  venueBookingClient: VenueBookingClient, accountClient: AccountClient, resultCase: ReviewCase, now: Date,
) {
  const teams = await resultTeams(prisma, resultCase.match);
  const context = await venueBookingClient.getMatchContext(resultCase.match.bookingId);
  const identity = (userId: string) => participantIdentity(accountClient, userId);
  const recommendation = resultCase.recommendations[0] ?? null;
  return {
    ...queueItem(resultCase, now),
    serverNow: now.toISOString(),
    declarationDeadlineAt: resultCase.declarationDeadlineAt.toISOString(),
    objectionDeadlineAt: resultCase.objectionDeadlineAt?.toISOString() ?? null,
    incidentDeadlineAt: resultCase.incidentDeadlineAt?.toISOString() ?? null,
    booking: context && {
      startAt: context.startAt, endAt: context.endAt,
      venue: { name: context.venue.name, address: context.venue.address }, court: { name: context.court.name },
    },
    match: {
      discipline: resultCase.match.discipline, mode: resultCase.match.mode, format: resultCase.match.format,
      ratio: RATIO_FROM_DB[resultCase.match.ratio],
      teams: await Promise.all((['A', 'B'] as const).map(async (side) => ({ side, players: await Promise.all(teams[side].map(identity)) }))),
    },
    claims: await Promise.all(resultCase.claims.map(async (claim) => ({
      id: claim.id, claimant: await identity(claim.claimantUserId), outcome: claim.outcome,
      sets: claim.sets.map((set) => ({ teamA: set.teamA, teamB: set.teamB })),
      evidenceIds: claim.evidence.map((item) => item.id), createdAt: claim.createdAt.toISOString(),
    }))),
    responses: await Promise.all(resultCase.responses.map(async (response) => ({
      id: response.id, user: await identity(response.userId), kind: response.kind, incidentType: response.incidentType,
      reason: response.reason, evidenceIds: response.evidence.map((item) => item.id), createdAt: response.createdAt.toISOString(),
    }))),
    supplementalEvidence: resultCase.evidence.map((item) => ({ id: item.id, ownerUserId: item.ownerUserId })),
    providerRecommendation: recommendation && {
      outcome: recommendation.outcome, reason: recommendation.reason,
      createdAt: recommendation.createdAt.toISOString(), nonBinding: true as const,
    },
  };
}

export async function getProviderResultCase(
  venueBookingClient: VenueBookingClient, accountClient: AccountClient, providerUserId: string, caseId: string, now = new Date(),
) {
  const resultCase = await prisma.matchResultCase.findFirst({
    where: { id: caseId, providerDeadlineAt: { not: null }, match: { providerUserId } }, include: reviewInclude,
  });
  if (!resultCase) throw new AppError(404, 'RESULT_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ kết quả.');
  const detail = await reviewDetail(venueBookingClient, accountClient, resultCase, now);
  return { ...detail, actions: { canRecommend: resultCase.status === 'provider_review' } };
}

export async function getAdminResultCase(
  venueBookingClient: VenueBookingClient, accountClient: AccountClient, caseId: string, now = new Date(),
) {
  const resultCase = await prisma.matchResultCase.findUnique({ where: { id: caseId }, include: reviewInclude });
  if (!resultCase) throw new AppError(404, 'RESULT_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ kết quả.');
  const detail = await reviewDetail(venueBookingClient, accountClient, resultCase, now);
  return { ...detail, actions: { canPreviewDecision: resultCase.status === 'admin_review' } };
}

function enterAdminReview(now: Date) {
  return {
    status: 'admin_review' as const, adminReviewStartedAt: now,
    adminNextReminderAt: new Date(now.getTime() + REVIEW_REMINDER_MS), version: { increment: 1 },
  };
}

/** BR-CM-38: đề xuất chỉ chuyển provider_review -> admin_review; không bao giờ chốt kết quả. */
export async function submitProviderRecommendation(
  providerUserId: string, matchId: string, input: { outcome: MatchOutcome; reason: string }, now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await lockMatch(tx, matchId);
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { resultCase: true } });
    const resultCase = match?.resultCase;
    if (!match || !resultCase || match.providerUserId !== providerUserId || resultCase.providerDeadlineAt === null) {
      throw new AppError(404, 'RESULT_CASE_NOT_FOUND', 'Không tìm thấy hồ sơ kết quả.');
    }
    if (Object.values(await resultTeams(tx, match)).flat().includes(providerUserId)) {
      throw new AppError(403, 'RESULT_PROVIDER_CONFLICT', 'Chủ sân nằm trong kèo không được đề xuất kết quả.');
    }
    if (resultCase.status !== 'provider_review') {
      throw new AppError(409, 'RESULT_PROVIDER_REVIEW_CLOSED', 'Hồ sơ không còn chờ chủ sân đề xuất.');
    }
    const recommendation = await tx.providerRecommendation.create({
      data: { caseId: resultCase.id, providerUserId, outcome: input.outcome, reason: input.reason, createdAt: now },
    });
    await tx.matchResultCase.update({ where: { id: resultCase.id }, data: enterAdminReview(now) });
    await writeResultNotification(tx, adminReviewNotification(match.id, resultCase.id, 'match.result.admin_review', 'Chủ sân đã gửi đề xuất kết quả kèo'));
    return { recommendationId: recommendation.id };
  });
}

/** Preview chỉ đọc, tính tại chỗ từ snapshot kèo; Finance tự tính lại khi nhận event final. */
/** Bằng chứng preview không trạng thái: ký admin, hồ sơ, version, outcome và reason (BR-CM-41). */
function previewToken(adminUserId: string, caseId: string, caseVersion: number, outcome: MatchOutcome, reason: string) {
  return createHmac('sha256', process.env.JWT_SECRET ?? 'change-me-in-real-env')
    .update(JSON.stringify(['admin-result-preview', adminUserId, caseId, caseVersion, outcome, reason]))
    .digest('base64url');
}

export async function previewAdminDecision(
  accountClient: AccountClient, adminUserId: string, matchId: string, input: { outcome: MatchOutcome; reason: string },
) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { resultCase: true } });
  if (!match?.resultCase || match.resultCase.status !== 'admin_review') {
    throw new AppError(409, 'RESULT_ADMIN_REVIEW_CLOSED', 'Hồ sơ không ở bước Admin quyết định.');
  }
  const teams = await resultTeams(prisma, match);
  const reserve = match.bookingPrice === null ? 0n
    : calculateMatchFunding(match.bookingPrice, RATIO_FROM_DB[match.ratio], match.capacity as 2 | 4).resultReserve;
  const allocations = allocateResultReserve(reserve, input.outcome, teams);
  return {
    caseVersion: match.resultCase.version,
    previewToken: previewToken(adminUserId, match.resultCase.id, match.resultCase.version, input.outcome, input.reason),
    outcome: input.outcome,
    reason: input.reason,
    rows: await Promise.all(Object.values(teams).flat().map(async (userId) => ({
      userId,
      displayName: (await participantIdentity(accountClient, userId)).displayName,
      amount: (allocations.get(userId) ?? 0n).toString(),
      withdrawable: true as const,
    }))),
    ratingEffect: match.mode === 'ranked' && input.outcome !== 'NO_RESULT' ? 'apply_ranked_result' as const : 'no_change' as const,
    bookingRevenueEffect: 'no_change' as const,
  };
}

/** BR-CM-41/42: xác nhận bước hai phải khớp version đã preview; quyết định là final. */
export async function decideAdminResult(
  adminUserId: string, matchId: string,
  input: { outcome: MatchOutcome; reason: string; caseVersion: number; previewToken: string }, now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await lockMatch(tx, matchId);
    const resultCase = await tx.matchResultCase.findUnique({ where: { matchId } });
    if (!resultCase || resultCase.status !== 'admin_review') {
      throw new AppError(409, 'RESULT_ADMIN_REVIEW_CLOSED', 'Hồ sơ không ở bước Admin quyết định.');
    }
    if (resultCase.version !== input.caseVersion) {
      throw new AppError(409, 'RESULT_CASE_VERSION_CONFLICT', 'Hồ sơ đã thay đổi; hãy xem lại tác động trước khi xác nhận.');
    }
    const expected = Buffer.from(previewToken(adminUserId, resultCase.id, resultCase.version, input.outcome, input.reason));
    const received = Buffer.from(input.previewToken);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new AppError(409, 'RESULT_PREVIEW_MISMATCH', 'Quyết định phải khớp đúng bản xem trước tác động của bạn.');
    }
    const decision = await tx.adminResultDecision.create({
      data: { caseId: resultCase.id, adminUserId, outcome: input.outcome, reason: input.reason, caseVersion: input.caseVersion, createdAt: now },
    });
    await writeResultFinal(tx, resultCase, input.outcome, decision.id, now);
    return { decisionId: decision.id };
  });
}

/** BR-CM-39/40: provider quá 24 giờ chuyển Admin; Admin nhắc ở 24 giờ, quá hạn ở 48 giờ rồi mỗi 24 giờ. Không đổi tiền/kết quả. */
export async function sweepResultReviews(now = new Date(), matchIds?: string[]): Promise<number> {
  const due = await prisma.matchResultCase.findMany({
    where: {
      ...(matchIds && { matchId: { in: matchIds } }),
      OR: [
        { status: 'provider_review', providerDeadlineAt: { lte: now } },
        { status: 'admin_review', adminNextReminderAt: { lte: now } },
      ],
    },
    select: { id: true, matchId: true },
    take: 100,
  });
  for (const target of due) {
    await prisma.$transaction(async (tx) => {
      await lockMatch(tx, target.matchId);
      const resultCase = await tx.matchResultCase.findUniqueOrThrow({ where: { id: target.id } });
      if (resultCase.status === 'provider_review' && resultCase.providerDeadlineAt && resultCase.providerDeadlineAt <= now) {
        await tx.matchResultCase.update({ where: { id: resultCase.id }, data: enterAdminReview(now) });
        await writeResultNotification(tx, adminReviewNotification(
          resultCase.matchId, resultCase.id, 'match.result.admin_review', 'Chủ sân quá hạn đề xuất, hồ sơ chuyển Admin',
        ));
      } else if (resultCase.status === 'admin_review' && resultCase.adminNextReminderAt && resultCase.adminNextReminderAt <= now) {
        const overdue = adminOverdue(resultCase, now);
        const next = resultCase.adminNextReminderAt.getTime() + REVIEW_REMINDER_MS;
        await tx.matchResultCase.update({
          where: { id: resultCase.id },
          data: { adminNextReminderAt: new Date(next > now.getTime() ? next : now.getTime() + REVIEW_REMINDER_MS) },
        });
        await writeResultNotification(tx, adminReviewNotification(
          resultCase.matchId, resultCase.id,
          overdue ? 'match.result.admin_overdue' : 'match.result.admin_reminder',
          overdue ? 'Hồ sơ kết quả kèo đã quá hạn xử lý 48 giờ' : 'Nhắc: hồ sơ kết quả kèo chờ quyết định',
        ));
      }
    });
  }
  return due.length;
}
