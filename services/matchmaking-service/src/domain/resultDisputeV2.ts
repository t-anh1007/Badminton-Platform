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
  insertSubmission, lockedCaseV2, prepareSubmission, sideOf, vnClock, type CaseContext, type SubmissionInput,
} from './resultClaimsV2.js';
import { enterAdminReview } from './resultLifecycle.js';
import { rereadUpload } from './resultOcr.js';

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
      where: { caseId, purpose: { in: ['claim', 'evidence'] }, supports: { not: null }, level: { not: null } },
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
