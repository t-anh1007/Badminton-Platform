import type { Prisma } from '@prisma/client';
import { proposeRuling, type CallLog, type RulingEvidence, type RulingInput } from '@khoaluantn/ai';
import { aiCallLogger, aiSettings, type AiChains } from '../lib/aiClients.js';
import { writeResultNotification } from '../lib/notificationOutbox.js';
import { prisma } from '../lib/prisma.js';
import { deadlineFor, resultWindows } from './deadlines.js';
import { searchKnowledge } from './knowledge.js';
import { adminReviewNotification, lockMatch, notifyRoster, resultTeams } from './matchResults.js';
import { sideOf, supersededClaimIds, vnClock } from './resultClaimsV2.js';
import { enterAdminReview } from './resultLifecycle.js';

// Tầng 2 (BR-RA-35..37, 40): AI soạn phán quyết tạm chỉ từ văn bản (không ảnh, không uy tín), chạy trong sweeper.

/** Đầu vào chỉ văn bản: tỉ số đã đọc/khai, mức, tín hiệu kiểm tra, thời điểm gửi. Ảnh Đỏ bị loại (BR-RA-30). */
async function rulingEvidence(caseId: string): Promise<{ evidence: RulingEvidence[]; format: 'bo3' | 'bo5' }> {
  const resultCase = await prisma.matchResultCase.findUniqueOrThrow({ where: { id: caseId }, include: { match: true } });
  const teams = await resultTeams(prisma, resultCase.match);
  const rows = await prisma.resultEvidence.findMany({
    where: {
      caseId, purpose: { in: ['claim', 'evidence'] }, level: { in: ['green', 'yellow'] }, supports: { not: null },
      claimId: { notIn: await supersededClaimIds(prisma, caseId) },
    },
    include: { claim: { include: { sets: { orderBy: { position: 'asc' } } } } },
    orderBy: { createdAt: 'asc' },
  });
  const uploads = new Map((await prisma.resultUpload.findMany({
    where: { id: { in: rows.map((row) => row.uploadId).filter((id): id is string => Boolean(id)) } }, select: { id: true, isScreenshot: true },
  })).map((row) => [row.id, row.isScreenshot]));
  return {
    format: resultCase.match.format,
    evidence: rows.map((row, index) => ({
      evidenceId: `E${index + 1}`,
      team: sideOf(teams, row.ownerUserId) ?? 'A',
      supports: row.supports!,
      level: row.level as 'green' | 'yellow',
      capturedAt: row.capturedAt?.toISOString() ?? null,
      nearDuplicate: row.nearDuplicateOfId !== null,
      screenshot: Boolean(row.uploadId && uploads.get(row.uploadId)),
      sets: (row.claim?.sets ?? []).map((set) => ({ a: set.teamA, b: set.teamB })),
      submittedAt: row.createdAt.toISOString(),
    })),
  };
}

export function knowledgeQuery(evidence: RulingEvidence[]): string {
  const parts = ['tranh chấp tỉ số bằng chứng hai bên mâu thuẫn tầng 2'];
  if (evidence.some((item) => item.nearDuplicate)) parts.push('ảnh gần trùng hồ sơ khác nghi trùng');
  if (evidence.some((item) => item.capturedAt === null)) parts.push('ảnh không có thời gian chụp');
  if (evidence.some((item) => item.screenshot)) parts.push('ảnh chụp màn hình');
  if (evidence.some((item) => item.level === 'yellow')) parts.push('mức Vàng');
  return parts.join(' ');
}

type Tx = Prisma.TransactionClient;

async function toAdmin(tx: Tx, caseId: string, matchId: string, now: Date, title: string) {
  await tx.matchResultCase.update({ where: { id: caseId }, data: { ...enterAdminReview(now), pendingRuling: false } });
  await writeResultNotification(tx, adminReviewNotification(matchId, caseId, 'match.result.admin_review', title));
}

/** Mỗi hồ sơ pendingRuling: truy hồi RAG → AI → công bố (≥ ngưỡng) / Admin (thấp, hết thời gian thử lại). */
export async function runPendingRulings(now: Date, deps: { ai: AiChains }, matchIds?: string[]): Promise<number> {
  const pending = await prisma.matchResultCase.findMany({
    where: { rulesVersion: 'ra_v1', status: 'ai_ruling', pendingRuling: true, ...(matchIds && { matchId: { in: matchIds } }) },
    select: { id: true, matchId: true, version: true },
    take: 20,
  });
  const settings = aiSettings();
  let handled = 0;
  for (const target of pending) {
    const { evidence, format } = await rulingEvidence(target.id);
    const chunks = await searchKnowledge(knowledgeQuery(evidence), { kinds: ['rule', 'precedent', 'sample'] }, deps);
    const input: RulingInput = { caseRef: target.id.slice(0, 8), format, evidence, chunks };
    const logger = aiCallLogger('ruling', target.id);
    let okLog: CallLog | undefined;
    const result = deps.ai.ruling.length === 0 || chunks.length === 0 ? null : await proposeRuling(deps.ai.ruling, input, {
      timeoutMs: settings.rulingTimeoutMs, fetchImpl: deps.ai.fetchImpl,
      onCall: (log) => { logger.onCall(log); if (log.ok) okLog = log; },
    });
    await logger.flush();

    const changed = await prisma.$transaction(async (tx) => {
      await lockMatch(tx, target.matchId);
      const resultCase = await tx.matchResultCase.findUniqueOrThrow({ where: { id: target.id } });
      // Khóa version: lượt chạy song song khác đã xử lý hồ sơ này thì bỏ qua (chỉ một AiRuling).
      if (resultCase.status !== 'ai_ruling' || !resultCase.pendingRuling || resultCase.version !== target.version) return false;
      if (!result) {
        if (resultCase.rulingRetryUntil && now < resultCase.rulingRetryUntil) return false;
        await toAdmin(tx, resultCase.id, resultCase.matchId, now, 'AI không soạn được phán quyết tạm, cần Admin quyết định');
        return true;
      }
      const { ruling, link } = result;
      const published = ruling.confidence >= settings.rulingThreshold;
      await tx.aiRuling.create({
        data: {
          caseId: resultCase.id, tier: 2, outcome: ruling.outcome, reasons: ruling.reasons, adminNotes: ruling.adminNotes,
          citations: [...new Set(ruling.reasons.flatMap((reason) => reason.citations))], confidence: ruling.confidence,
          provider: link.provider, model: link.model, latencyMs: okLog ? Math.round(okLog.latencyMs) : null,
          tokensIn: okLog?.tokensIn ?? null, tokensOut: okLog?.tokensOut ?? null, publishedAt: published ? now : null, createdAt: now,
        },
      });
      if (!published) {
        await toAdmin(tx, resultCase.id, resultCase.matchId, now, 'Phán quyết tạm của AI chưa đủ tin cậy, cần Admin quyết định');
        return true;
      }
      const appeal = deadlineFor(now, resultWindows().appeal);
      await tx.matchResultCase.update({
        where: { id: resultCase.id },
        data: { status: 'appeal_window', outcome: ruling.outcome, appealDeadlineAt: appeal.at, pendingRuling: false, version: { increment: 1 } },
      });
      // Roster chỉ thấy lý do công bố; adminNotes chỉ dành cho Admin.
      const match = await tx.match.findUniqueOrThrow({ where: { id: resultCase.matchId }, select: { id: true, organizerUserId: true } });
      await notifyRoster(tx, match, resultCase.id, 'match.result.ai_ruling_published', 'Đã có phán quyết tạm của tranh chấp',
        `${ruling.reasons.map((reason) => reason.text).join(' ')} Bên bị xử thua có tới ${vnClock(appeal.at)} để kháng nghị.`);
      return true;
    });
    if (changed) handled += 1;
  }
  return handled;
}
