import type { MatchResultCase, Prisma } from '@prisma/client';
import { writeResultNotification } from '../lib/notificationOutbox.js';
import { prisma } from '../lib/prisma.js';
import { adminReviewNotification, lockMatch } from './matchResults.js';
import { currentClaims, proposalOf } from './resultClaimsV2.js';
import { enterAdminReview, sweepResultDeadlines, writeResultFinal } from './resultLifecycle.js';
import { closeEvidenceWindow } from './resultDisputeV2.js';
import type { PrivateObjectStorageClient } from '@khoaluantn/object-storage';
import type { AiChains } from '../lib/aiClients.js';

// Sweeper hạn của hồ sơ ra_v1 (BR-RA-21, 22, 34a, 38): idempotent, kiểm tra lại dưới khóa kèo.

type Tx = Prisma.TransactionClient;
export interface SweepDeps { ai?: AiChains; storage?: () => PrivateObjectStorageClient }

function dueWhere(now: Date): Prisma.MatchResultCaseWhereInput[] {
  return [
    { status: 'proposed', responseDeadlineAt: { lte: now } },
    { status: 'acceptance_grace', graceDeadlineAt: { lte: now } },
    { status: 'appeal_window', appealDeadlineAt: { lte: now } },
  ];
}

/** Chuyển một hồ sơ đã tới hạn; trả true nếu có chuyển trạng thái. */
async function settleDue(tx: Tx, resultCase: MatchResultCase, now: Date): Promise<boolean> {
  if (resultCase.status === 'proposed' && resultCase.responseDeadlineAt && resultCase.responseDeadlineAt <= now) {
    const proposal = proposalOf(await currentClaims(tx, resultCase.id));
    if (proposal?.level === 'red') {
      // BR-RA-17: bản có ảnh lạ không bao giờ tự final.
      await tx.matchResultCase.update({ where: { id: resultCase.id }, data: enterAdminReview(now) });
      await writeResultNotification(tx, adminReviewNotification(resultCase.matchId, resultCase.id, 'match.result.admin_review', 'Kết quả có ảnh lạ cần Admin quyết định'));
      return true;
    }
    await writeResultFinal(tx, resultCase, resultCase.outcome!, resultCase.id, now);
    return true;
  }
  if (resultCase.status === 'acceptance_grace' && resultCase.graceDeadlineAt && resultCase.graceDeadlineAt <= now) {
    await writeResultFinal(tx, resultCase, resultCase.outcome!, resultCase.id, now);
    return true;
  }
  if (resultCase.status === 'appeal_window' && resultCase.appealDeadlineAt && resultCase.appealDeadlineAt <= now) {
    // BR-RA-34a/36: hết 6h không có kháng nghị hợp lệ → kết quả tạm thành final.
    await writeResultFinal(tx, resultCase, resultCase.outcome!, resultCase.id, now);
    await tx.aiRuling.updateMany({ where: { caseId: resultCase.id, publishedAt: { not: null }, finalOutcome: null }, data: { finalOutcome: resultCase.outcome, overturned: false } });
    return true;
  }
  return false;
}

export async function sweepResultDeadlinesV2(now = new Date(), matchIds?: string[], deps: SweepDeps = {}): Promise<number> {
  const scope = matchIds ? { matchId: { in: matchIds } } : {};
  const due = await prisma.matchResultCase.findMany({
    where: { ...scope, rulesVersion: 'ra_v1', OR: dueWhere(now) }, select: { id: true, matchId: true }, take: 100,
  });
  let changed = 0;
  for (const target of due) {
    const settled = await prisma.$transaction(async (tx) => {
      await lockMatch(tx, target.matchId);
      return settleDue(tx, await tx.matchResultCase.findUniqueOrThrow({ where: { id: target.id } }), now);
    });
    if (settled) changed += 1;
  }
  if (deps.ai) {
    const evidenceDue = await prisma.matchResultCase.findMany({
      where: {
        ...scope, rulesVersion: 'ra_v1', status: 'evidence_window',
        OR: [{ evidenceDeadlineAt: { lte: now } }, { evidenceClosedAt: { lte: now } }],
      },
      select: { id: true }, take: 100,
    });
    let storage: PrivateObjectStorageClient | undefined;
    try {
      storage = deps.storage?.();
    } catch {
      storage = undefined; // thiếu cấu hình kho ảnh: không đọc lại được, ảnh chưa đọc sẽ chuyển Admin sau 30 phút
    }
    for (const target of evidenceDue) {
      const result = await closeEvidenceWindow(target.id, { ai: deps.ai, storage, now: () => now });
      if (result !== 'noop' && result !== 'retry') changed += 1;
    }
  }
  return changed;
}

/** Sweeper chung (60 giây) và quét lười khi đọc hồ sơ: luật cũ cho mọi hồ sơ theo trạng thái cũ, rồi nhánh ra_v1. */
export async function sweepAllResultDeadlines(now = new Date(), matchIds?: string[], deps: SweepDeps = {}) {
  return (await sweepResultDeadlines(now, matchIds)) + (await sweepResultDeadlinesV2(now, matchIds, deps));
}
