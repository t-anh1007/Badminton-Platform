import type { MatchResultCase, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { currentClaims, proposalOf } from './resultClaimsV2.js';

// Vì sao hồ sơ vào hàng chờ Admin (plan web B3/B5). Không lưu cột riêng: suy ra từ dữ liệu chỉ ghi thêm,
// nên đúng cả với hồ sơ đã mở trước khi có trường này.

export const ADMIN_REASONS = ['unknown_photo', 'appeal', 'ai_unavailable', 'evidence_unreadable', 'incident', 'legacy'] as const;
export type AdminReason = (typeof ADMIN_REASONS)[number];

export interface AdminReasonFacts {
  rulesVersion: 'legacy' | 'ra_v1';
  enteredAdmin: boolean;
  hasIncident: boolean;
  hasAcceptedAppeal: boolean;
  evidenceClosed: boolean;
  proposalRed: boolean;
  unreadDisputeEvidence: number;
}

/** Hàm thuần: thứ tự ưu tiên theo đường vào Admin (sự cố, kháng nghị, ảnh lạ, sau 2 giờ bằng chứng). */
export function adminReasonOf(facts: AdminReasonFacts): AdminReason | null {
  if (!facts.enteredAdmin) return null;
  if (facts.rulesVersion === 'legacy') return 'legacy';
  if (facts.hasIncident) return 'incident';
  if (facts.hasAcceptedAppeal) return 'appeal';
  if (!facts.evidenceClosed) return facts.proposalRed ? 'unknown_photo' : null;
  return facts.unreadDisputeEvidence > 0 ? 'evidence_unreadable' : 'ai_unavailable';
}

type Db = Prisma.TransactionClient | typeof prisma;

export async function loadAdminReason(resultCase: MatchResultCase, db: Db = prisma): Promise<AdminReason | null> {
  if (resultCase.adminReviewStartedAt === null) return null;
  if (resultCase.rulesVersion === 'legacy') return 'legacy';
  const [incidents, appeals, proposal, disputeImages] = await Promise.all([
    db.resultResponse.count({ where: { caseId: resultCase.id, kind: 'incident' } }),
    db.resultAppeal.count({ where: { caseId: resultCase.id, accepted: true } }),
    currentClaims(db, resultCase.id).then(proposalOf),
    db.resultEvidence.findMany({ where: { caseId: resultCase.id, purpose: 'evidence', uploadId: { not: null } }, select: { uploadId: true } }),
  ]);
  const readIds = disputeImages.length === 0 ? new Set<string>() : new Set((await db.evidenceReading.findMany({
    where: { uploadId: { in: disputeImages.map((row) => row.uploadId!) }, ok: true }, select: { uploadId: true },
  })).map((row) => row.uploadId));
  return adminReasonOf({
    rulesVersion: resultCase.rulesVersion,
    enteredAdmin: true,
    hasIncident: incidents > 0,
    hasAcceptedAppeal: appeals > 0,
    evidenceClosed: resultCase.evidenceClosedAt !== null,
    proposalRed: proposal?.level === 'red',
    unreadDisputeEvidence: disputeImages.filter((row) => !readIds.has(row.uploadId!)).length,
  });
}
