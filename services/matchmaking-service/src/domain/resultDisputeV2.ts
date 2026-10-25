import type { Prisma } from '@prisma/client';
import type { PrivateObjectStorageClient } from '@khoaluantn/object-storage';
import type { AccountClient } from '../clients/account.js';
import type { AiChains } from '../lib/aiClients.js';
import { AppError } from '../lib/errors.js';
import { writeResultNotification } from '../lib/notificationOutbox.js';
import { prisma } from '../lib/prisma.js';
import { deadlineFor, resultWindows, type Level } from './deadlines.js';
import type { MatchOutcome } from './matchRules.js';
import { adminReviewNotification, lockMatch, notifyRoster, resultTeams } from './matchResults.js';
import {
  insertSubmission, lockedCaseV2, payerOf, prepareSubmission, sideOf, supersededClaimIds, vnClock, type CaseContext, type SubmissionInput,
} from './resultClaimsV2.js';
import { enterAdminReview, writeResultFinal } from './resultLifecycle.js';
import { rereadUpload } from './resultOcr.js';
import { inspectResultEvidence, type ResultEvidenceItem } from './resultEvidence.js';
import { upsertChunks } from './knowledge.js';

// Tranh chấp tỉ số tầng 1 (BR-RA-30..34a) cho hồ sơ ra_v1.

type Tx = Prisma.TransactionClient;
const UNREAD_RETRY_MS = 30 * 60_000;
const OUTCOME_TEXT: Record<MatchOutcome, string> = { TEAM_A_WIN: 'Đội A thắng', TEAM_B_WIN: 'Đội B thắng', NO_RESULT: 'Không có kết quả' };

/** BR-RA-30: mở 2 giờ nộp bằng chứng kín cho cả roster (hạn giãn qua đêm). */
export async function openEvidenceWindow(tx: Tx, ctx: CaseContext, now: Date) {
  const deadline = deadlineFor(now, resultWindows().evidence);
  await tx.matchResultCase.update({
    where: { id: ctx.resultCase.id },
    data: { status: 'evidence_window', evidenceDeadlineAt: deadline.at, evidenceClosedAt: null, version: { increment: 1 } },
  });
  await notifyRoster(tx, ctx.match, ctx.resultCase.id, 'match.result.disputed', 'Kết quả trận đang tranh chấp',
    `Hai bên có tới ${vnClock(deadline.at)} để nộp ảnh bằng chứng; ảnh được giữ kín tới khi hết hạn. Tiền giữ cho kết quả tạm khóa.`);
}

/**
 * BR-RA-31..34: gom bằng chứng hợp lệ (Xanh/Vàng) theo bên thắng mà ảnh ủng hộ; ảnh Đỏ chỉ bị loại riêng.
 * 1 bên → kết quả tạm theo bên đó; 0 bên → NO_RESULT; ≥ 2 bên → tầng 2.
 */
export function tier1Decide(items: Array<{ supports: MatchOutcome; level: Level }>):
  { kind: 'single'; outcome: MatchOutcome } | { kind: 'none' } | { kind: 'conflict' } {
  const outcomes = [...new Set(items.filter((item) => item.level !== 'red').map((item) => item.supports))];
  if (outcomes.length === 0) return { kind: 'none' };
  if (outcomes.length === 1) return { kind: 'single', outcome: outcomes[0]! };
  return { kind: 'conflict' };
}

function assertEvidenceOpen(ctx: CaseContext, now: Date) {
  const { resultCase } = ctx;
  if (resultCase.status !== 'evidence_window' || resultCase.evidenceClosedAt !== null
    || !resultCase.evidenceDeadlineAt || now >= resultCase.evidenceDeadlineAt) {
    throw new AppError(409, 'RESULT_EVIDENCE_WINDOW_CLOSED', 'Đã hết thời gian nộp bằng chứng.');
  }
}

/** Nộp ảnh tranh chấp trong 2 giờ: đọc ảnh như khi khai (bản nháp), chèn với purpose `evidence`, giữ kín với đội kia. */
export async function submitDisputeEvidence(
  input: SubmissionInput & { matchId: string; userId: string },
  deps: { accountClient?: AccountClient; now?: Date },
) {
  const now = deps.now ?? new Date();
  const match = await prisma.match.findUnique({ where: { id: input.matchId }, include: { resultCase: true } });
  if (!match?.resultCase) throw new AppError(404, 'RESULT_CASE_NOT_FOUND', 'Kèo chưa mở khai kết quả.');
  const teams = await resultTeams(prisma, match);
  if (!sideOf(teams, input.userId)) throw new AppError(403, 'RESULT_ROSTER_ONLY', 'Chỉ người trong kèo được nộp bằng chứng.');
  const prepared = await prepareSubmission(match, match.resultCase, teams, input.userId, input, { accountClient: deps.accountClient, now });
  return prisma.$transaction(async (tx) => {
    const ctx = await lockedCaseV2(tx, input.matchId, input.userId);
    assertEvidenceOpen(ctx, now);
    const claim = await insertSubmission(tx, ctx.resultCase, ctx.match, input.userId, prepared, { purpose: 'evidence', now });
    return { submissionId: claim.id, level: prepared.level, outcome: prepared.outcome };
  });
}

/** BR-RA-30: một đội bấm "Đã nộp đủ"; cả hai đội bấm thì đóng sớm. Trả true khi đã đủ hai đội. */
export async function markEvidenceDone(matchId: string, userId: string, now = new Date()): Promise<{ bothTeamsDone: boolean; caseId: string }> {
  return prisma.$transaction(async (tx) => {
    const ctx = await lockedCaseV2(tx, matchId, userId);
    assertEvidenceOpen(ctx, now);
    const done = await tx.resultResponse.findMany({ where: { caseId: ctx.resultCase.id, kind: 'evidence_done' }, select: { userId: true } });
    if (!done.some((row) => row.userId === userId)) {
      await tx.resultResponse.create({ data: { caseId: ctx.resultCase.id, userId, kind: 'evidence_done', createdAt: now } });
    }
    const sides = new Set([...done.map((row) => row.userId), userId].map((id) => sideOf(ctx.teams, id)));
    const bothTeamsDone = sides.has('A') && sides.has('B');
    if (bothTeamsDone) {
      await tx.matchResultCase.update({ where: { id: ctx.resultCase.id }, data: { evidenceClosedAt: now, version: { increment: 1 } } });
    }
    return { bothTeamsDone, caseId: ctx.resultCase.id };
  });
}

export interface CloseDeps { ai: AiChains; storage?: PrivateObjectStorageClient; now: () => Date }

/**
 * Đóng 2 giờ bằng chứng (hết hạn hoặc hai đội bấm Đã nộp đủ). Ảnh tranh chấp chưa đọc được thì đọc lại; quá
 * hạn + 30 phút vẫn chưa đọc → Admin. Khi AI tắt, tầng 1 chạy bằng tỉ số gõ tay; tầng 2 chuyển Admin (spec §0).
 */
export async function closeEvidenceWindow(caseId: string, deps: CloseDeps): Promise<'rule_ruling' | 'ai_ruling_pending' | 'admin_review' | 'retry' | 'noop'> {
  const now = deps.now();
  const target = await prisma.matchResultCase.findUnique({ where: { id: caseId } });
  if (!target || target.status !== 'evidence_window') return 'noop';
  const closedAt = target.evidenceClosedAt ?? target.evidenceDeadlineAt!;
  if (closedAt > now) return 'noop';

  const aiOn = deps.ai.ocr.length > 0;
  let unread = 0;
  if (aiOn) {
    const disputeImages = await prisma.resultEvidence.findMany({
      where: { caseId, purpose: 'evidence', uploadId: { not: null } }, select: { uploadId: true },
    });
    for (const { uploadId } of disputeImages) {
      if (await prisma.evidenceReading.count({ where: { uploadId: uploadId!, ok: true } }) > 0) continue;
      const reading = deps.storage ? await rereadUpload(uploadId!, { storage: deps.storage, ai: deps.ai, now: deps.now }) : null;
      if (!reading) unread += 1;
    }
  }

  return prisma.$transaction(async (tx) => {
    await lockMatch(tx, target.matchId);
    const resultCase = await tx.matchResultCase.findUniqueOrThrow({ where: { id: caseId } });
    if (resultCase.status !== 'evidence_window') return 'noop' as const;
    const match = await tx.match.findUniqueOrThrow({ where: { id: resultCase.matchId } });
    if (unread > 0) {
      if (now.getTime() < closedAt.getTime() + UNREAD_RETRY_MS) return 'retry' as const;
      await tx.matchResultCase.update({ where: { id: caseId }, data: { ...enterAdminReview(now), evidenceClosedAt: resultCase.evidenceClosedAt ?? now } });
      await writeResultNotification(tx, adminReviewNotification(match.id, caseId, 'match.result.admin_review', 'Ảnh tranh chấp chưa đọc được, cần Admin quyết định'));
      return 'admin_review' as const;
    }
    const evidence = await tx.resultEvidence.findMany({
      where: {
        caseId, purpose: { in: ['claim', 'evidence'] }, supports: { not: null }, level: { not: null },
        claimId: { notIn: await supersededClaimIds(tx, caseId) },
      },
      select: { supports: true, level: true },
    });
    const decision = tier1Decide(evidence.map((item) => ({ supports: item.supports!, level: item.level! })));
    if (decision.kind === 'conflict') {
      if (deps.ai.ruling.length === 0) {
        await tx.matchResultCase.update({ where: { id: caseId }, data: { ...enterAdminReview(now), evidenceClosedAt: resultCase.evidenceClosedAt ?? now } });
        await writeResultNotification(tx, adminReviewNotification(match.id, caseId, 'match.result.admin_review', 'Tranh chấp có bằng chứng hai phía cần Admin quyết định'));
        return 'admin_review' as const;
      }
      await tx.matchResultCase.update({
        where: { id: caseId },
        data: {
          status: 'ai_ruling', pendingRuling: true, rulingRetryUntil: new Date(now.getTime() + UNREAD_RETRY_MS),
          evidenceClosedAt: resultCase.evidenceClosedAt ?? now, version: { increment: 1 },
        },
      });
      await notifyRoster(tx, match, caseId, 'match.result.ai_ruling', 'Tranh chấp đang được phân tích',
        'Bằng chứng của hai bên mâu thuẫn; hệ thống đang soạn phán quyết tạm.');
      return 'ai_ruling_pending' as const;
    }
    const outcome: MatchOutcome = decision.kind === 'single' ? decision.outcome : 'NO_RESULT';
    const reasons = decision.kind === 'single'
      ? [{ text: `Chỉ có bằng chứng hợp lệ ủng hộ kết quả "${OUTCOME_TEXT[outcome]}".`, citations: ['BR-RA-31'] }]
      : [{ text: 'Không bên nào có bằng chứng hợp lệ nên trận tạm ghi nhận không có kết quả.', citations: ['BR-RA-33'] }];
    await tx.aiRuling.create({
      data: { caseId, tier: 1, outcome, reasons, citations: reasons.flatMap((reason) => reason.citations), publishedAt: now, createdAt: now },
    });
    const appeal = deadlineFor(now, resultWindows().appeal);
    await tx.matchResultCase.update({
      where: { id: caseId },
      data: {
        status: 'appeal_window', outcome, appealDeadlineAt: appeal.at, evidenceClosedAt: resultCase.evidenceClosedAt ?? now,
        version: { increment: 1 },
      },
    });
    await notifyRoster(tx, match, caseId, 'match.result.rule_ruling', 'Đã có kết quả tạm của tranh chấp',
      `${reasons[0]!.text} Bên bị xử thua có tới ${vnClock(appeal.at)} để kháng nghị kèm ảnh mới hoặc chỉ ra điểm sai.`);
    return 'rule_ruling' as const;
  });
}

// ---- Task 15: kháng nghị, chấp nhận phán quyết, án lệ (BR-RA-38..41, 63) ----

export const APPEAL_MAX_PHOTOS = 2;

/** Bên bị xử thua theo kết quả tạm/phán quyết tạm; NO_RESULT → cả hai đội (BR-RA-38). */
function rulingLosers(teams: CaseContext['teams'], outcome: MatchOutcome): string[] {
  if (outcome === 'TEAM_A_WIN') return teams.B;
  if (outcome === 'TEAM_B_WIN') return teams.A;
  return [...teams.A, ...teams.B];
}

async function currentRuling(tx: Tx, caseId: string, rulingId: string) {
  const ruling = await tx.aiRuling.findFirst({ where: { caseId, publishedAt: { not: null } }, orderBy: { createdAt: 'desc' } });
  if (!ruling || ruling.id !== rulingId) {
    throw new AppError(409, 'RESULT_VERSION_STALE', 'Kết quả tạm đã thay đổi; hãy xem lại trước khi thao tác.');
  }
  return ruling;
}

function assertAppealOpen(ctx: CaseContext, now: Date) {
  if (ctx.resultCase.status !== 'appeal_window' || !ctx.resultCase.appealDeadlineAt || now >= ctx.resultCase.appealDeadlineAt) {
    throw new AppError(409, 'RESULT_APPEAL_CLOSED', 'Đã hết thời gian kháng nghị.');
  }
}

/** Đội đã có kháng nghị hợp lệ / đã Chấp nhận phán quyết đang hiệu lực. */
async function teamsActed(tx: Tx, ctx: CaseContext, ruling: { id: string; publishedAt: Date | null }) {
  const [appeals, accepts] = await Promise.all([
    tx.resultAppeal.findMany({ where: { caseId: ctx.resultCase.id, rulingId: ruling.id, accepted: true }, select: { userId: true } }),
    tx.resultResponse.findMany({ where: { caseId: ctx.resultCase.id, kind: 'confirm', createdAt: { gte: ruling.publishedAt! } }, select: { userId: true } }),
  ]);
  const sides = (rows: Array<{ userId: string }>) => new Set(rows.map((row) => sideOf(ctx.teams, row.userId)).filter(Boolean));
  return { appealed: sides(appeals), accepted: sides(accepts) };
}

/** Chuyển các kháng nghị hợp lệ của hồ sơ sang Admin (một hồ sơ cho cả hai đội). */
export async function sendAppealsToAdmin(tx: Tx, match: CaseContext['match'], caseId: string, now: Date) {
  await tx.matchResultCase.update({ where: { id: caseId }, data: enterAdminReview(now) });
  await notifyRoster(tx, match, caseId, 'match.result.appealed', 'Kết quả tạm bị kháng nghị',
    'Hồ sơ chuyển Admin quyết định. Tiền giữ cho kết quả và điểm tiếp tục khóa tới khi có quyết định.');
  await writeResultNotification(tx, adminReviewNotification(match.id, caseId, 'match.result.admin_review', 'Có kháng nghị kết quả kèo cần quyết định'));
}

/**
 * BR-RA-38: chỉ bên bị xử thua, trong 6 giờ, kèm ảnh mới (≤ 2, ngoài hạn mức 7) hoặc chỉ ra điểm sai cụ thể.
 * Thiếu căn cứ thì bị từ chối (vẫn ghi lại để đo đạc); hợp lệ thì chuyển Admin, phán quyết tạm không có hiệu lực tiền.
 * NO_RESULT: cả hai đội cùng được kháng nghị vào một hồ sơ, giữ kín với đội kia; chỉ chuyển Admin khi đội còn lại
 * cũng đã kháng nghị/Chấp nhận, hoặc khi hết hạn.
 */
export async function submitAppeal(
  input: { matchId: string; userId: string; rulingId: string; reason: string; pointedReason?: string; evidence?: ResultEvidenceItem[] },
  deps: { storage: PrivateObjectStorageClient; now?: Date },
) {
  const now = deps.now ?? new Date();
  const items = input.evidence ?? [];
  if (items.length > APPEAL_MAX_PHOTOS) throw new AppError(400, 'RESULT_EVIDENCE_COUNT', 'Kháng nghị kèm tối đa 2 ảnh mới.');
  const verified = items.length > 0 ? await inspectResultEvidence(deps.storage, input.userId, items) : [];
  const grounded = verified.length > 0 || Boolean(input.pointedReason?.trim());
  const outcome = await prisma.$transaction(async (tx) => {
    const ctx = await lockedCaseV2(tx, input.matchId, input.userId);
    assertAppealOpen(ctx, now);
    const ruling = await currentRuling(tx, ctx.resultCase.id, input.rulingId);
    if (!rulingLosers(ctx.teams, ruling.outcome).includes(input.userId)) {
      throw new AppError(403, 'RESULT_APPEAL_LOSER_ONLY', 'Chỉ bên bị xử thua được kháng nghị.');
    }
    const acted = await teamsActed(tx, ctx, ruling);
    const viewerSide = sideOf(ctx.teams, input.userId)!;
    if (acted.appealed.has(viewerSide)) throw new AppError(409, 'RESULT_APPEAL_ALREADY_SENT', 'Đội bạn đã gửi kháng nghị.');
    if (!grounded) {
      await tx.resultAppeal.create({
        data: { caseId: ctx.resultCase.id, rulingId: ruling.id, userId: input.userId, reason: input.reason, evidenceIds: [], accepted: false, createdAt: now },
      });
      return 'rejected' as const;
    }
    const used = await tx.resultEvidence.count({ where: { caseId: ctx.resultCase.id, ownerUserId: input.userId, purpose: 'appeal' } });
    if (used + verified.length > APPEAL_MAX_PHOTOS) throw new AppError(409, 'RESULT_EVIDENCE_LIMIT', 'Kháng nghị kèm tối đa 2 ảnh mới.');
    const evidence = await Promise.all(verified.map((item, index) => tx.resultEvidence.create({
      data: { ...item, caseId: ctx.resultCase.id, ownerUserId: input.userId, position: 100 + used + index, purpose: 'appeal', createdAt: now },
      select: { id: true },
    })));
    const appeal = await tx.resultAppeal.create({
      data: {
        caseId: ctx.resultCase.id, rulingId: ruling.id, userId: input.userId, reason: input.reason, pointedReason: input.pointedReason ?? null,
        evidenceIds: evidence.map((item) => item.id), accepted: true, createdAt: now,
      },
    });
    await tx.aiRuling.update({ where: { id: ruling.id }, data: { appealedAt: now } });
    const otherSide = viewerSide === 'A' ? 'B' : 'A';
    if (ruling.outcome === 'NO_RESULT' && !acted.appealed.has(otherSide) && !acted.accepted.has(otherSide)) {
      await tx.matchResultCase.update({ where: { id: ctx.resultCase.id }, data: { version: { increment: 1 } } });
      return { appealId: appeal.id, status: 'appeal_window' as const };
    }
    await sendAppealsToAdmin(tx, ctx.match, ctx.resultCase.id, now);
    return { appealId: appeal.id, status: 'admin_review' as const };
  });
  if (outcome === 'rejected') {
    throw new AppError(400, 'RESULT_APPEAL_GROUNDS_REQUIRED', 'Kháng nghị cần kèm ảnh mới hoặc chỉ ra điểm sai cụ thể trong lý do.');
  }
  return outcome;
}

/**
 * BR-RA-38a (D63): bên bị xử thua Chấp nhận để chốt sớm; một người mỗi đội bị xử thua là đủ (NO_RESULT: mỗi đội một người).
 * BR-RA-23: partner được trả thay Chấp nhận thì chưa chốt khi người trả chưa Chấp nhận.
 */
export async function acceptRuling(input: { matchId: string; userId: string; rulingId: string }, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const ctx = await lockedCaseV2(tx, input.matchId, input.userId);
    assertAppealOpen(ctx, now);
    const ruling = await currentRuling(tx, ctx.resultCase.id, input.rulingId);
    const losers = rulingLosers(ctx.teams, ruling.outcome);
    if (!losers.includes(input.userId)) throw new AppError(403, 'RESULT_APPEAL_LOSER_ONLY', 'Chỉ bên bị xử thua được chấp nhận phán quyết.');
    const accepted = new Set((await tx.resultResponse.findMany({
      where: { caseId: ctx.resultCase.id, kind: 'confirm', createdAt: { gte: ruling.publishedAt! } }, select: { userId: true },
    })).map((row) => row.userId));
    if (!accepted.has(input.userId)) {
      await tx.resultResponse.create({ data: { caseId: ctx.resultCase.id, userId: input.userId, kind: 'confirm', createdAt: now } });
      accepted.add(input.userId);
    }
    if (ruling.outcome === 'NO_RESULT') {
      const acted = await teamsActed(tx, ctx, ruling);
      const viewerSide = sideOf(ctx.teams, input.userId)!;
      if (acted.appealed.has(viewerSide)) throw new AppError(409, 'RESULT_APPEAL_ALREADY_SENT', 'Đội bạn đã gửi kháng nghị.');
      if (acted.appealed.has(viewerSide === 'A' ? 'B' : 'A')) {
        await sendAppealsToAdmin(tx, ctx.match, ctx.resultCase.id, now);
        return { status: 'admin_review' as const };
      }
    }
    const payer = await payerOf(tx, ctx.match.id, input.userId);
    const waitingPayer = payer !== null && losers.includes(payer) && !accepted.has(payer);
    const losingTeams = (['A', 'B'] as const).map((side) => ctx.teams[side]).filter((team) => team.some((userId) => losers.includes(userId)));
    if (waitingPayer || !losingTeams.every((team) => team.some((userId) => accepted.has(userId)))) {
      await tx.matchResultCase.update({ where: { id: ctx.resultCase.id }, data: { version: { increment: 1 } } });
      return { status: 'appeal_window' as const };
    }
    await writeResultFinal(tx, ctx.resultCase, ruling.outcome, ruling.id, now);
    await tx.aiRuling.update({ where: { id: ruling.id }, data: { finalOutcome: ruling.outcome, overturned: false } });
    return { status: 'final' as const };
  });
}

const LEVEL_TEXT: Record<string, string> = { green: 'Xanh', yellow: 'Vàng', red: 'Đỏ' };

/**
 * BR-RA-63: hồ sơ có quyết định Admin thành án lệ ẩn danh theo template cố định (không dùng LLM, không tên/id người).
 * Gọi sau khi quyết định đã ghi (embedding nằm ngoài transaction).
 */
export async function recordPrecedent(caseId: string, deps: { ai: AiChains }) {
  const resultCase = await prisma.matchResultCase.findUniqueOrThrow({
    where: { id: caseId }, include: { match: true, adminDecision: true },
  });
  if (resultCase.rulesVersion !== 'ra_v1' || !resultCase.adminDecision) return null;
  const teams = await resultTeams(prisma, resultCase.match);
  const evidence = await prisma.resultEvidence.findMany({
    where: { caseId, purpose: { in: ['claim', 'evidence'] } }, select: { ownerUserId: true, level: true, supports: true, capturedAt: true, nearDuplicateOfId: true, exactDuplicateOfId: true },
  });
  const describe = (side: 'A' | 'B') => {
    const own = evidence.filter((item) => sideOf(teams, item.ownerUserId) === side);
    if (own.length === 0) return 'không có ảnh';
    return own.map((item) => [
      `ảnh ${LEVEL_TEXT[item.level ?? ''] ?? 'chưa xếp mức'} ủng hộ ${item.supports ?? 'chưa rõ'}`,
      item.capturedAt ? null : 'không có giờ chụp', item.nearDuplicateOfId ? 'nghi trùng' : null, item.exactDuplicateOfId ? 'trùng chính xác' : null,
    ].filter(Boolean).join(', ')).join('; ');
  };
  const decision = resultCase.adminDecision;
  const text = `Tranh chấp ${resultCase.match.format.toUpperCase()}: bằng chứng bên A ${describe('A')}; bên B ${describe('B')}; `
    + `kết luận ${decision.outcome}; lý do: ${decision.reason}`;
  await upsertChunks([{ id: `precedent:${caseId}`, kind: 'precedent', ref: caseId, text, metadata: { decisionId: decision.id } }], deps);
  return text;
}
