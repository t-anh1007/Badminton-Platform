import type { MatchResultCase, TeamSide } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { publicReasons } from './confidence.js';
import { resultTeams } from './matchResults.js';
import { currentClaims, losingTeamOf, proposalOf, responseOpenUntil, sideOf } from './resultClaimsV2.js';

// Phần hồ sơ kết quả riêng của ra_v1 cho roster (BR-RA-06): mức, lý do (không nêu uy tín), hạn, ảnh + số AI đọc.

const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;
const reasonsOf = (value: unknown) => publicReasons(Array.isArray(value) ? value.map(String) : []);

/** BR-RA-30: ảnh nộp trong 2h tranh chấp giữ kín với đội kia tới khi hết hạn hoặc cả hai đội bấm Đã nộp đủ. */
export function evidenceSealed(resultCase: MatchResultCase) {
  return resultCase.status === 'evidence_window' && resultCase.evidenceClosedAt === null;
}

export async function resultCaseViewV2(resultCase: MatchResultCase, match: { id: string; organizerUserId: string }, viewerUserId: string, now: Date) {
  const teams = await resultTeams(prisma, match);
  const viewerSide = sideOf(teams, viewerUserId);
  const claims = await currentClaims(prisma, resultCase.id);
  const submissions = await prisma.resultClaim.findMany({
    where: { caseId: resultCase.id, purpose: 'evidence' }, include: { sets: { orderBy: { position: 'asc' } }, evidence: { orderBy: { position: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  const responses = await prisma.resultResponse.findMany({ where: { caseId: resultCase.id }, select: { userId: true, kind: true, createdAt: true } });
  const ruling = await prisma.aiRuling.findFirst({ where: { caseId: resultCase.id, publishedAt: { not: null } }, orderBy: { createdAt: 'desc' } });
  const uploadIds = [...claims, ...submissions].flatMap((claim) => claim.evidence.map((item) => item.uploadId)).filter((id): id is string => Boolean(id));
  const readings = await prisma.evidenceReading.findMany({ where: { uploadId: { in: uploadIds }, ok: true }, orderBy: { createdAt: 'desc' } });
  const readingOf = new Map<string, unknown>();
  for (const row of readings) if (!readingOf.has(row.uploadId)) readingOf.set(row.uploadId, row.reading);

  const sealed = evidenceSealed(resultCase);
  const claimView = (claim: (typeof claims)[number]) => ({
    id: claim.id,
    claimantUserId: claim.claimantUserId,
    side: sideOf(teams, claim.claimantUserId),
    outcome: claim.outcome,
    level: claim.level,
    reasons: reasonsOf(claim.levelReasons),
    sets: claim.sets.map((set) => ({ teamA: set.teamA, teamB: set.teamB })),
    // BR-RA-06: roster thấy ô đã sửa cùng số AI đọc ban đầu (aiReading của từng ảnh).
    editedCells: claim.editedCells ?? [],
    manualEntry: claim.manualEntry,
    columnMappedBy: claim.columnMappedBy,
    createdAt: claim.createdAt.toISOString(),
    images: claim.evidence.map((item) => ({
      id: item.id, mimeType: item.mimeType, level: item.level, flags: reasonsOf(item.levelReasons),
      capturedAt: iso(item.capturedAt), aiReading: item.uploadId ? readingOf.get(item.uploadId) ?? null : null,
    })),
  });

  const proposal = proposalOf(claims);
  const openUntil = responseOpenUntil(resultCase);
  const responseOpen = openUntil !== null && now < openUntil;
  const losers = proposal && resultCase.outcome ? teams[losingTeamOf(resultCase.outcome, sideOf(teams, proposal.claimantUserId)!)] : [];
  const own = claims.find((claim) => claim.claimantUserId === viewerUserId);
  const mine = (kind: string) => responses.some((row) => row.userId === viewerUserId && row.kind === kind);
  const evidenceOpen = resultCase.status === 'evidence_window' && resultCase.evidenceDeadlineAt !== null
    && now < resultCase.evidenceDeadlineAt && resultCase.evidenceClosedAt === null;
  const appealOpen = resultCase.status === 'appeal_window' && resultCase.appealDeadlineAt !== null && now < resultCase.appealDeadlineAt && ruling !== null;
  const rulingLosers = !ruling ? [] : ruling.outcome === 'TEAM_A_WIN' ? teams.B : ruling.outcome === 'TEAM_B_WIN' ? teams.A : [...teams.A, ...teams.B];
  const incidentOpen = (resultCase.status === 'declaration_open' && now < resultCase.declarationDeadlineAt) || responseOpen || evidenceOpen
    || (resultCase.status === 'incident_window' && resultCase.incidentDeadlineAt !== null && now < resultCase.incidentDeadlineAt);

  return {
    rulesVersion: resultCase.rulesVersion,
    version: resultCase.version,
    level: proposal?.level ?? null,
    reasons: proposal ? reasonsOf(proposal.levelReasons) : [],
    responseDeadlineBaseAt: iso(resultCase.responseDeadlineBaseAt),
    responseDeadlineAt: iso(resultCase.responseDeadlineAt),
    graceDeadlineAt: iso(resultCase.graceDeadlineAt),
    evidenceDeadlineAt: iso(resultCase.evidenceDeadlineAt),
    evidenceClosedAt: iso(resultCase.evidenceClosedAt),
    appealDeadlineAt: iso(resultCase.appealDeadlineAt),
    proposalClaimId: proposal?.id ?? null,
    claims: claims.map(claimView),
    // Kết quả tạm tầng 1 / phán quyết tạm tầng 2: chỉ lý do công bố, không có adminNotes.
    ruling: ruling && {
      id: ruling.id, tier: ruling.tier, outcome: ruling.outcome, reasons: ruling.reasons, publishedAt: ruling.publishedAt!.toISOString(),
    },
    disputeEvidence: submissions
      .filter((item) => !sealed || sideOf(teams, item.claimantUserId) === viewerSide)
      .map(claimView),
    viewerActions: {
      canUpload: ['declaration_open', 'proposed', 'acceptance_grace', 'evidence_window'].includes(resultCase.status),
      canClaim: !own && ((resultCase.status === 'declaration_open' && now < resultCase.declarationDeadlineAt) || responseOpen),
      canReplace: Boolean(own && proposal?.id === own.id && resultCase.status === 'proposed' && claims.length === 1
        && responses.length === 0 && now < resultCase.declarationDeadlineAt),
      canConfirm: responseOpen && losers.includes(viewerUserId) && !mine('confirm'),
      canObject: responseOpen && proposal !== null && proposal.claimantUserId !== viewerUserId,
      canReportIncident: incidentOpen && !mine('incident'),
      canSubmitEvidence: evidenceOpen,
      canAppeal: appealOpen && rulingLosers.includes(viewerUserId),
      canAcceptRuling: appealOpen && rulingLosers.includes(viewerUserId)
        && !responses.some((row) => row.userId === viewerUserId && row.kind === 'confirm' && ruling !== null && row.createdAt >= ruling.publishedAt!),
      canMarkEvidenceDone: evidenceOpen
        && !responses.some((row) => row.kind === 'evidence_done' && sideOf(teams, row.userId) === viewerSide),
    } as Record<string, boolean>,
    viewerSide: viewerSide as TeamSide,
  };
}
