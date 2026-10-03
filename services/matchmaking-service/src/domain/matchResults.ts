import type { Match, MatchResultCase, Prisma, TeamSide } from '@prisma/client';
import type { PrivateObjectStorageClient } from '@khoaluantn/object-storage';
import type { AccountClient } from '../clients/account.js';
import type { VenueBookingClient } from '../clients/venueBooking.js';
import { AppError } from '../lib/errors.js';
import { writeResultNotification } from '../lib/notificationOutbox.js';
import { prisma } from '../lib/prisma.js';
import {
  InvalidScoreError,
  RATIO_FROM_DB,
  allocateResultReserve,
  calculateMatchFunding,
  inferMatchOutcome,
  losingSide,
  objectionOpenUntil,
  type MatchOutcome,
  type SetScore,
} from './matchRules.js';
import { participantIdentity } from './matches.js';
import { inspectResultEvidence, insertResultEvidence, type ResultEvidenceItem } from './resultEvidence.js';

const HOUR_MS = 60 * 60_000;
export const DECLARATION_WINDOW_MS = 12 * HOUR_MS;
export const OBJECTION_WINDOW_MS = 12 * HOUR_MS;
export const PROVIDER_REVIEW_MS = 24 * HOUR_MS;
export const ADMIN_REMINDER_MS = 24 * HOUR_MS;

type Tx = Prisma.TransactionClient;

export async function lockMatch(tx: Tx, matchId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${matchId}, 0))`;
}

/** Roster đã khóa theo đội, mỗi đội theo thứ tự JOIN; chủ kèo đứng đầu đội A. */
export async function resultTeams(db: Tx | typeof prisma, match: Pick<Match, 'id' | 'organizerUserId'>) {
  const joins = await db.join.findMany({
    where: { matchId: match.id, status: 'confirmed' },
    orderBy: { createdAt: 'asc' },
    select: { participantUserId: true, teamSide: true },
  });
  const teams: Record<TeamSide, string[]> = { A: [match.organizerUserId], B: [] };
  for (const join of joins) teams[join.teamSide ?? 'B'].push(join.participantUserId);
  return teams;
}

/** BR-CM-23: mở khai báo khi booking kết thúc; hạn tính từ snapshot endAt, không theo lúc event đến. */
export async function openResultCase(tx: Tx, match: Pick<Match, 'id' | 'endAt' | 'organizerUserId'>) {
  if (!match.endAt) return; // kèo cũ không có snapshot giờ chơi
  if (await tx.matchResultCase.findUnique({ where: { matchId: match.id } })) return;
  const resultCase = await tx.matchResultCase.create({
    data: { matchId: match.id, declarationDeadlineAt: new Date(match.endAt.getTime() + DECLARATION_WINDOW_MS) },
  });
  await notifyRoster(tx, match, resultCase.id, 'match.result.declaration_open', 'Hãy khai kết quả trận',
    'Trận đã kết thúc. Người trong kèo có 12 giờ để nhập tỷ số kèm ảnh bằng chứng.');
}

/** Thông báo roster về hồ sơ kết quả (in-app + email bắt buộc), mở trang kèo. */
export async function notifyRoster(
  tx: Tx, match: Pick<Match, 'id' | 'organizerUserId'>, caseId: string, kind: string, title: string, body: string,
) {
  await writeResultNotification(tx, {
    recipients: Object.values(await resultTeams(tx, match)).flat().map((userId) => ({ type: 'user' as const, userId, targetRole: 'player' as const })),
    kind, title, body, matchId: match.id, caseId, actionKind: 'match.result.view',
  });
}

export function adminReviewNotification(matchId: string, caseId: string, kind: string, title: string) {
  return {
    recipients: [{ type: 'role' as const, targetRole: 'admin' as const }],
    kind, title,
    body: 'Hồ sơ kết quả kèo đang chờ Admin quyết định. Tiền giữ cho kết quả và rating vẫn đang khóa.',
    matchId, caseId, actionKind: 'admin.match-result.review' as const,
  };
}

/** BR-CM-30/39: tranh chấp đi provider trước, trừ khi provider nằm trong roster thì vào Admin ngay. */
export async function openResultDispute(tx: Tx, resultCase: MatchResultCase, match: Match, rosterUserIds: string[], now: Date) {
  const providerEligible = match.providerUserId !== null && !rosterUserIds.includes(match.providerUserId);
  await notifyRoster(tx, match, resultCase.id, 'match.result.disputed', 'Kết quả trận đang được xem xét',
    'Có tranh chấp hoặc sự cố về kết quả. Tiền giữ cho kết quả và điểm xếp hạng tạm khóa tới khi có quyết định.');
  await writeResultNotification(tx, providerEligible
    ? {
        recipients: [{ type: 'user', userId: match.providerUserId!, targetRole: 'provider' }],
        kind: 'match.result.provider_review', title: 'Có kết quả kèo cần xem xét',
        body: 'Một kèo tại sân của bạn có tranh chấp kết quả. Vui lòng xem bằng chứng và gửi đề xuất trong 24 giờ.',
        matchId: match.id, caseId: resultCase.id, actionKind: 'provider.match-result.review',
      }
    : adminReviewNotification(match.id, resultCase.id, 'match.result.admin_review', 'Có tranh chấp kết quả kèo cần quyết định'));
  await tx.matchResultCase.update({
    where: { id: resultCase.id },
    data: providerEligible
      ? { status: 'provider_review', outcome: null, providerDeadlineAt: new Date(now.getTime() + PROVIDER_REVIEW_MS), version: { increment: 1 } }
      : {
          status: 'admin_review', outcome: null, adminReviewStartedAt: now,
          adminNextReminderAt: new Date(now.getTime() + ADMIN_REMINDER_MS), version: { increment: 1 },
        },
  });
}

export async function submitResultClaim(
  storage: PrivateObjectStorageClient,
  input: { matchId: string; userId: string; sets: SetScore[]; evidence: ResultEvidenceItem[] },
  now = new Date(),
) {
  const match = await prisma.match.findUnique({ where: { id: input.matchId } });
  if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
  let inferred: ReturnType<typeof inferMatchOutcome>;
  try {
    inferred = inferMatchOutcome({ format: match.format, sets: input.sets });
  } catch (error) {
    if (error instanceof InvalidScoreError) throw new AppError(400, 'RESULT_SCORE_INVALID', 'Tỷ số không hợp lệ theo luật cầu lông.');
    throw error;
  }
  if (inferred.outcome === 'NO_RESULT') {
    throw new AppError(409, 'RESULT_USE_INCIDENT', 'Tỷ số không xác định được bên thắng; hãy báo sự cố.');
  }
  const roster = Object.values(await resultTeams(prisma, match)).flat();
  if (!roster.includes(input.userId)) throw new AppError(403, 'RESULT_ROSTER_ONLY', 'Chỉ người trong kèo được khai kết quả.');
  // PO 2026-10-01: chỉ chủ kèo nhập tỷ số; người còn lại đồng ý, khiếu nại hoặc báo sự cố.
  if (input.userId !== match.organizerUserId) throw new AppError(403, 'RESULT_ORGANIZER_ONLY', 'Chỉ chủ kèo được nhập kết quả trận.');
  const evidence = await inspectResultEvidence(storage, input.userId, input.evidence);

  return prisma.$transaction(async (tx) => {
    await lockMatch(tx, match.id);
    const resultCase = await tx.matchResultCase.findUnique({ where: { matchId: match.id } });
    if (!resultCase || !['declaration_open', 'provisional'].includes(resultCase.status) || now >= resultCase.declarationDeadlineAt) {
      throw new AppError(409, 'RESULT_DECLARATION_CLOSED', 'Đã hết thời gian khai kết quả.');
    }
    if (await tx.resultClaim.findFirst({ where: { caseId: resultCase.id, claimantUserId: input.userId } })) {
      throw new AppError(409, 'RESULT_CLAIM_EXISTS', 'Bạn đã khai kết quả cho kèo này.');
    }
    const claim = await tx.resultClaim.create({
      data: {
        caseId: resultCase.id, claimantUserId: input.userId, outcome: inferred.outcome,
        setWinsA: inferred.setWinsA, setWinsB: inferred.setWinsB, createdAt: now,
        sets: { create: input.sets.map((set, position) => ({ position, teamA: set.teamA, teamB: set.teamB })) },
      },
    });
    await insertResultEvidence(tx, { matchId: match.id, ownerUserId: input.userId, evidence, claimId: claim.id });
    if (resultCase.status === 'declaration_open') {
      // BR-CM-28: bản đầu chỉ tạm tính; mở 12 giờ phản hồi, không bao giờ final đồng bộ.
      await tx.matchResultCase.update({
        where: { id: resultCase.id },
        data: {
          status: 'provisional', outcome: inferred.outcome,
          objectionDeadlineAt: new Date(now.getTime() + OBJECTION_WINDOW_MS), version: { increment: 1 },
        },
      });
      // Spec §11: báo roster có bản khai đầu để bên còn lại kịp đồng ý hoặc khiếu nại trong 12 giờ.
      await notifyRoster(tx, match, resultCase.id, 'match.result.provisional', 'Đã có kết quả tạm của trận',
        'Chủ kèo đã khai kết quả. Bạn có 12 giờ để đồng ý hoặc khiếu nại; quá hạn kết quả sẽ được chốt.');
    } else if (resultCase.outcome !== inferred.outcome) {
      await openResultDispute(tx, resultCase, match, roster, now);
    } else {
      await tx.matchResultCase.update({ where: { id: resultCase.id }, data: { version: { increment: 1 } } });
    }
    return { claimId: claim.id, outcome: inferred.outcome };
  });
}

/** BR-CM-29: bản của chủ kèo cùng bên thắng được hiển thị; nếu không, bản hợp lệ đầu tiên. */
function displayClaim<T extends { claimantUserId: string; outcome: MatchOutcome; createdAt: Date }>(
  claims: T[], outcome: MatchOutcome | null, organizerUserId: string,
): T | null {
  const sameWinner = claims.filter((claim) => claim.outcome === outcome).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return sameWinner.find((claim) => claim.claimantUserId === organizerUserId) ?? sameWinner[0] ?? null;
}

export async function getPlayerResultCase(
  venueBookingClient: VenueBookingClient,
  accountClient: AccountClient,
  matchId: string,
  viewerUserId: string,
  now = new Date(),
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      resultCase: {
        include: {
          claims: { include: { sets: { orderBy: { position: 'asc' } }, evidence: { orderBy: { position: 'asc' } } } },
          responses: { where: { userId: viewerUserId }, select: { kind: true } },
        },
      },
    },
  });
  const resultCase = match?.resultCase;
  if (!match || !resultCase) throw new AppError(404, 'RESULT_CASE_NOT_FOUND', 'Kèo chưa mở khai kết quả.');
  const teams = await resultTeams(prisma, match);
  if (!Object.values(teams).flat().includes(viewerUserId)) {
    throw new AppError(403, 'RESULT_ROSTER_ONLY', 'Chỉ người trong kèo được xem hồ sơ kết quả.');
  }
  const context = await venueBookingClient.getMatchContext(match.bookingId);
  if (!context) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy lịch sân của kèo.');

  const shown = ['provisional', 'final'].includes(resultCase.status)
    ? displayClaim(resultCase.claims, resultCase.outcome, match.organizerUserId)
    : null;
  const withinDeclaration = ['declaration_open', 'provisional'].includes(resultCase.status) && now < resultCase.declarationDeadlineAt;
  const responseOpen = resultCase.status === 'provisional' && now < (objectionOpenUntil(resultCase) ?? now);
  const incidentOpen = (resultCase.status === 'declaration_open' && now < resultCase.declarationDeadlineAt)
    || responseOpen
    || (resultCase.status === 'incident_window' && resultCase.incidentDeadlineAt !== null && now < resultCase.incidentDeadlineAt);
  const loserSide = losingSide(resultCase.outcome);

  return {
    matchId: match.id,
    serverNow: now.toISOString(),
    status: resultCase.status,
    // Kết quả chính thức độc lập với bản khai (Admin xử vắng mặt, NO_RESULT do không khai...).
    finalOutcome: resultCase.status === 'final' ? resultCase.outcome : null,
    declarationDeadlineAt: resultCase.declarationDeadlineAt.toISOString(),
    objectionDeadlineAt: resultCase.objectionDeadlineAt?.toISOString() ?? null,
    teamGraceDeadlineAt: resultCase.teamGraceDeadlineAt?.toISOString() ?? null,
    match: {
      discipline: match.discipline,
      mode: match.mode,
      format: match.format,
      ratio: RATIO_FROM_DB[match.ratio],
      startAt: context.startAt,
      endAt: context.endAt,
      venue: { name: context.venue.name, address: context.venue.address },
      court: { name: context.court.name },
      teams: await Promise.all((['A', 'B'] as const).map(async (side) => ({
        side,
        players: await Promise.all(teams[side].map((userId) => participantIdentity(accountClient, userId))),
      }))),
    },
    provisional: shown && {
      claimant: await participantIdentity(accountClient, shown.claimantUserId),
      sets: shown.sets.map((set) => ({ teamA: set.teamA, teamB: set.teamB })),
      outcome: shown.outcome,
      evidence: shown.evidence.map((item) => ({ id: item.id, mimeType: item.mimeType })),
    },
    viewerActions: {
      canClaim: withinDeclaration && viewerUserId === match.organizerUserId && !resultCase.claims.some((claim) => claim.claimantUserId === viewerUserId),
      canConfirm: responseOpen && loserSide !== null && teams[loserSide].includes(viewerUserId)
        && !resultCase.responses.some((response) => response.kind === 'confirm'),
      canObject: responseOpen,
      canReportIncident: incidentOpen,
    },
    viewerMoney: viewerMoney(match, teams, resultCase.outcome, viewerUserId, await prisma.join.findMany({
      // Chỗ trả thay đã thu tiền; đồng đội rút thì về `reserved`, tiền vẫn của người trả (BR-CM-76).
      where: { matchId: match.id, payerUserId: { not: null }, paymentContributionId: { not: null }, status: { in: ['reserved', 'confirmed'] } },
      select: { payerUserId: true, participantUserId: true, status: true },
    })),
  };
}

/** Chỉ roster thấy; dự phóng theo kết quả tạm hiện tại, chưa có thì theo NO_RESULT. */
function viewerMoney(
  match: Match, teams: Record<TeamSide, string[]>, outcome: MatchOutcome | null, viewerUserId: string,
  prepaidJoins: Array<{ payerUserId: string | null; participantUserId: string; status: string }> = [],
) {
  if (match.bookingPrice === null || teams.B.length === 0) return null;
  const funding = calculateMatchFunding(match.bookingPrice, RATIO_FROM_DB[match.ratio], match.capacity as 2 | 4);
  // D58: tính theo người thực trả — người trả gánh thêm mỗi chỗ đã trả thay; người được trả thay không bỏ đồng nào.
  const paidForOthers = BigInt(prepaidJoins.filter((j) => j.payerUserId === viewerUserId).length);
  const prepaidForViewer = prepaidJoins.some((j) => j.status === 'confirmed' && j.participantUserId === viewerUserId && j.payerUserId !== viewerUserId);
  const ownShare = prepaidForViewer ? 0n : viewerUserId === match.organizerUserId ? funding.organizerContribution : funding.feePerSlot;
  const contribution = ownShare + paidForOthers * funding.feePerSlot;
  const receivable = allocateResultReserve(funding.resultReserve, outcome ?? 'NO_RESULT', teams).get(viewerUserId) ?? 0n;
  return {
    // PO 2026-09-26: phần của riêng người xem trong quỹ giữ, theo tỷ lệ khoản đã góp.
    heldForResult: ((contribution * funding.resultReserve) / funding.totalContribution).toString(),
    projectedReceivable: receivable.toString(),
    projectedFinalCost: (contribution > receivable ? contribution - receivable : 0n).toString(),
    withdrawableIfFinal: true,
  };
}
