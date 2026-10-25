import type { MatchResultCase } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import type { VenueBookingClient } from '../clients/venueBooking.js';
import { resultTeams } from './matchResults.js';
import { currentClaims, proposalOf, sideOf } from './resultClaimsV2.js';
import { listAdminResultCases, type ResultCaseStatusFilter } from './resultLifecycle.js';
import { loadAdminReason, type AdminReason } from './resultAdminReason.js';

// Plan web A5: hàng chờ Admin có lý do + mức (B5), chi tiết bản khai ảnh cho Admin (B6, Q9), loại vi phạm cố định (B7).
// Nằm ngoài resultLifecycle để không tạo vòng import với resultClaimsV2.

/** BR-RA-51: loại vi phạm Admin được chọn. Trùng chính xác và kháng nghị vô căn cứ do hệ thống tự ghi. */
export const ADMIN_VIOLATION_KINDS = ['false_claim', 'near_duplicate_fraud', 'false_incident'] as const;

export function assertAdminViolationKinds(violations: unknown) {
  if (!Array.isArray(violations)) return;
  if (violations.some((item) => !(ADMIN_VIOLATION_KINDS as readonly string[]).includes((item as { kind?: unknown })?.kind as string))) {
    throw new AppError(400, 'RESULT_VIOLATION_KIND_INVALID', 'Loại vi phạm không hợp lệ.');
  }
}

async function caseFacts(resultCase: MatchResultCase) {
  const [adminReason, proposal] = await Promise.all([
    loadAdminReason(resultCase),
    resultCase.rulesVersion === 'ra_v1' ? currentClaims(prisma, resultCase.id).then(proposalOf) : Promise.resolve(null),
  ]);
  return { adminReason, level: proposal?.level ?? null };
}

/** Hàng chờ Admin kèm lý do và mức; lọc theo lý do/mức tính trong bộ nhớ (hàng chờ nhỏ, lý do không lưu cột). */
export async function listAdminQueueV2(
  venueBookingClient: VenueBookingClient,
  input: { status?: ResultCaseStatusFilter; page?: number; pageSize?: number; reason?: AdminReason; level?: 'green' | 'yellow' | 'red' },
  now = new Date(),
) {
  let caseIds: string[] | undefined;
  if (input.reason || input.level) {
    const rows = await prisma.matchResultCase.findMany({ where: { status: input.status ?? 'admin_review' }, orderBy: { createdAt: 'asc' }, take: 1000 });
    const facts = await Promise.all(rows.map(caseFacts));
    caseIds = rows.filter((_, index) => (!input.reason || facts[index]!.adminReason === input.reason)
      && (!input.level || facts[index]!.level === input.level)).map((row) => row.id);
  }
  const queue = await listAdminResultCases(venueBookingClient, { ...input, caseIds }, now);
  const rows = await prisma.matchResultCase.findMany({ where: { id: { in: queue.items.map((item) => item.caseId) } } });
  const factsOf = new Map(await Promise.all(rows.map(async (row) => [row.id, await caseFacts(row)] as const)));
  return { ...queue, items: queue.items.map((item) => ({ ...item, ...factsOf.get(item.caseId)! })) };
}

const minConfidence = (reading: unknown) => {
  const sets = (reading as { sets?: Array<{ confLeft?: number; confRight?: number }> } | null)?.sets ?? [];
  const values = sets.flatMap((set) => [set.confLeft, set.confRight]).filter((value): value is number => typeof value === 'number');
  return values.length === 0 ? null : Math.min(...values);
};

/** Phần riêng của hồ sơ ra_v1 trong màn xử của Admin: mọi bản khai/bản nộp, lý do kể cả nội bộ, tín hiệu từng ảnh. */
export async function adminCaseExtrasV2(caseId: string) {
  const resultCase = await prisma.matchResultCase.findUniqueOrThrow({ where: { id: caseId }, include: { match: true } });
  if (resultCase.rulesVersion !== 'ra_v1') return { adminReason: await loadAdminReason(resultCase) };
  const teams = await resultTeams(prisma, resultCase.match);
  const claims = await prisma.resultClaim.findMany({
    where: { caseId }, orderBy: { createdAt: 'asc' },
    include: { sets: { orderBy: { position: 'asc' } }, evidence: { orderBy: { position: 'asc' } } },
  });
  const superseded = new Set(claims.map((claim) => claim.supersedesClaimId).filter(Boolean));
  const evidence = claims.flatMap((claim) => claim.evidence);
  const uploadIds = evidence.map((item) => item.uploadId).filter((id): id is string => Boolean(id));
  const [uploads, readings] = await Promise.all([
    prisma.resultUpload.findMany({ where: { id: { in: uploadIds } }, select: { id: true, isScreenshot: true } }),
    prisma.evidenceReading.findMany({ where: { uploadId: { in: uploadIds }, ok: true }, orderBy: { createdAt: 'desc' } }),
  ]);
  const screenshot = new Map(uploads.map((row) => [row.id, row.isScreenshot]));
  const readingOf = new Map<string, (typeof readings)[number]>();
  for (const row of readings) if (!readingOf.has(row.uploadId)) readingOf.set(row.uploadId, row);
  const dupIds = evidence.flatMap((item) => [item.exactDuplicateOfId, item.nearDuplicateOfId]).filter((id): id is string => Boolean(id));
  const dupRows = await prisma.resultEvidence.findMany({ where: { id: { in: dupIds } }, select: { id: true, case: { select: { match: { select: { businessCode: true } } } } } });
  const codeOf = new Map(dupRows.map((row) => [row.id, row.case.match.businessCode]));
  const ref = (id: string | null) => (id ? { matchCode: codeOf.get(id) ?? null } : null);
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

  return {
    adminReason: await loadAdminReason(resultCase),
    claimViews: claims.map((claim) => ({
      id: claim.id, claimantUserId: claim.claimantUserId, side: sideOf(teams, claim.claimantUserId), purpose: claim.purpose,
      superseded: superseded.has(claim.id), outcome: claim.outcome, level: claim.level, reasons: list(claim.levelReasons),
      sets: claim.sets.map((set) => ({ teamA: set.teamA, teamB: set.teamB })), editedCells: claim.editedCells ?? [],
      manualEntry: claim.manualEntry, columnMappedBy: claim.columnMappedBy, createdAt: claim.createdAt.toISOString(),
      images: claim.evidence.map((item) => {
        const read = item.uploadId ? readingOf.get(item.uploadId) : undefined;
        return {
          id: item.id, mimeType: item.mimeType, level: item.level, reasons: list(item.levelReasons), supports: item.supports,
          capturedAt: item.capturedAt?.toISOString() ?? null, isScreenshot: item.uploadId ? screenshot.get(item.uploadId) ?? false : false,
          exactDuplicateOf: ref(item.exactDuplicateOfId), nearDuplicateOf: ref(item.nearDuplicateOfId),
          ai: read ? { provider: read.provider, model: read.model, confidence: minConfidence(read.reading), reading: read.reading } : null,
        };
      }),
    })),
  };
}
