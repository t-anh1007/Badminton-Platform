import type { MatchResultCase, TeamSide } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { publicReasons } from './confidence.js';
import { resultTeams } from './matchResults.js';
import { currentClaims, losingTeamOf, proposalOf, responseOpenUntil, sideOf } from './resultClaimsV2.js';
import { loadAdminReason } from './resultAdminReason.js';
import { photoQuota } from './resultOcr.js';
import type { AccountClient } from '../clients/account.js';

// Phần hồ sơ kết quả riêng của ra_v1 cho roster (BR-RA-06): mức, lý do (không nêu uy tín), hạn, ảnh + số AI đọc.

const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;
const reasonsOf = (value: unknown) => publicReasons(Array.isArray(value) ? value.map(String) : []);

const EXCERPT_MAX = 400;
const KIND_TITLE: Record<string, string> = { precedent: 'Án lệ đã xử', sample: 'Ca mẫu' };

/**
 * Plan web A2 (B8, Q5): trích dẫn đọc được cho roster. Luật → "Luật N" + đoạn luật; án lệ/ca mẫu → id thay thế theo
 * thứ tự (không lộ id hồ sơ khác) và bỏ phần "lý do:" của Admin (có thể có tên người).
 */
async function playerCitations(rawReasons: unknown, rawCitations: unknown) {
  const reasons = (Array.isArray(rawReasons) ? rawReasons : []) as Array<{ text?: unknown; citations?: unknown }>;
  const ids = [...new Set([
    ...(Array.isArray(rawCitations) ? rawCitations.map(String) : []),
    ...reasons.flatMap((reason) => (Array.isArray(reason.citations) ? reason.citations.map(String) : [])),
  ])];
  const chunks = new Map((await prisma.knowledgeChunk.findMany({
    where: { id: { in: ids } }, select: { id: true, kind: true, text: true },
  })).map((chunk) => [chunk.id, chunk]));
  let hidden = 0;
  const publicOf = new Map(ids.map((id) => {
    const chunk = chunks.get(id);
    const kind = chunk?.kind ?? (/^(precedent|sample):/.exec(id)?.[1] ?? 'rule');
    if (kind !== 'rule') {
      hidden += 1;
      const text = chunk?.text.split(/;\s*lý do:/)[0]!.trim() ?? null;
      return [id, { id: `${kind}-${hidden}`, title: KIND_TITLE[kind] ?? 'Án lệ đã xử', excerpt: text && text.slice(0, EXCERPT_MAX) }];
    }
    const ref = id.split('#')[0]!;
    const excerpt = chunk ? chunk.text.replace(new RegExp(`^${ref}:\\s*`), '').slice(0, EXCERPT_MAX) : null;
    return [id, { id, title: `Luật ${ref.replace(/^BR-[A-Z]+-/, '')}`, excerpt }];
  }));
  return {
    reasons: reasons.map((reason) => ({
      text: String(reason.text ?? ''),
      citations: (Array.isArray(reason.citations) ? reason.citations.map(String) : []).map((id) => publicOf.get(id)!.id),
    })),
    citations: [...publicOf.values()],
  };
}

/** BR-RA-30: ảnh nộp trong 2h tranh chấp giữ kín với đội kia tới khi hết hạn hoặc cả hai đội bấm Đã nộp đủ. */
export function evidenceSealed(resultCase: MatchResultCase, now: Date) {
  return resultCase.status === 'evidence_window' && resultCase.evidenceClosedAt === null
    && resultCase.evidenceDeadlineAt !== null && now < resultCase.evidenceDeadlineAt;
}

export async function resultCaseViewV2(
  resultCase: MatchResultCase, match: { id: string; organizerUserId: string }, viewerUserId: string, now: Date,
  deps: { accountClient?: AccountClient } = {},
) {
  const teams = await resultTeams(prisma, match);
  const viewerSide = sideOf(teams, viewerUserId);
  const claims = await currentClaims(prisma, resultCase.id);
  const submissions = await prisma.resultClaim.findMany({
    where: { caseId: resultCase.id, purpose: 'evidence' }, include: { sets: { orderBy: { position: 'asc' } }, evidence: { orderBy: { position: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  const responses = await prisma.resultResponse.findMany({ where: { caseId: resultCase.id }, select: { userId: true, kind: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
  const ruling = await prisma.aiRuling.findFirst({ where: { caseId: resultCase.id, publishedAt: { not: null } }, orderBy: { createdAt: 'desc' } });
  const uploadIds = [...claims, ...submissions].flatMap((claim) => claim.evidence.map((item) => item.uploadId)).filter((id): id is string => Boolean(id));
  const readings = await prisma.evidenceReading.findMany({ where: { uploadId: { in: uploadIds }, ok: true }, orderBy: { createdAt: 'desc' } });
  const readingOf = new Map<string, unknown>();
  for (const row of readings) if (!readingOf.has(row.uploadId)) readingOf.set(row.uploadId, row.reading);

  const sealed = evidenceSealed(resultCase, now);
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
  const displayName = async (userId: string) => (await deps.accountClient?.getPublicMatchProfile(userId).catch(() => null))?.displayName ?? null;
  const adminDecision = await prisma.adminResultDecision.findUnique({
    where: { caseId: resultCase.id }, select: { outcome: true, reason: true, createdAt: true },
  });
  const viewerAppeal = await prisma.resultAppeal.findFirst({
    where: { caseId: resultCase.id, userId: viewerUserId }, orderBy: { createdAt: 'desc' }, select: { accepted: true, createdAt: true },
  });

  // BR-RA-23: partner được trả thay đã chấp nhận nhưng người trả (cùng đội thua) chưa → còn chờ người trả.
  let pendingPayerUserId: string | null = null;
  if (resultCase.status === 'proposed' && proposal && resultCase.outcome) {
    const accepted = new Set([
      ...responses.filter((row) => row.kind === 'confirm').map((row) => row.userId),
      ...claims.filter((claim) => claim.outcome === resultCase.outcome).map((claim) => claim.claimantUserId),
    ].filter((userId) => losers.includes(userId)));
    const paid = await prisma.join.findMany({
      where: { matchId: match.id, status: 'confirmed', payerUserId: { not: null } }, select: { participantUserId: true, payerUserId: true },
    });
    pendingPayerUserId = paid.find((join) => accepted.has(join.participantUserId) && join.payerUserId !== join.participantUserId
      && losers.includes(join.payerUserId!) && !accepted.has(join.payerUserId!))?.payerUserId ?? null;
  }
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
      id: ruling.id, tier: ruling.tier, outcome: ruling.outcome, publishedAt: ruling.publishedAt!.toISOString(),
      ...await playerCitations(ruling.reasons, ruling.citations),
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
      canObject: responseOpen && losers.includes(viewerUserId),
      canReportIncident: incidentOpen && !mine('incident'),
      canSubmitEvidence: evidenceOpen,
      canAppeal: appealOpen && rulingLosers.includes(viewerUserId),
      canAcceptRuling: appealOpen && rulingLosers.includes(viewerUserId)
        && !responses.some((row) => row.userId === viewerUserId && row.kind === 'confirm' && ruling !== null && row.createdAt >= ruling.publishedAt!),
      canMarkEvidenceDone: evidenceOpen
        && !responses.some((row) => row.kind === 'evidence_done' && sideOf(teams, row.userId) === viewerSide),
    } as Record<string, boolean>,
    viewerSide: viewerSide as TeamSide,
    // Web (plan A1): ai đã Đồng ý / Phản đối, chờ người trả phần, kháng nghị của chính người xem, lý do ở Admin.
    responses: await Promise.all(responses.filter((row) => row.kind === 'confirm' || row.kind === 'object').map(async (row) => ({
      userId: row.userId, displayName: await displayName(row.userId), kind: row.kind, createdAt: row.createdAt.toISOString(),
    }))),
    pendingPayerUserId,
    viewerQuota: await photoQuota(resultCase, viewerUserId, now),
    viewerAppeal: viewerAppeal && { accepted: viewerAppeal.accepted, createdAt: viewerAppeal.createdAt.toISOString() },
    adminReason: await loadAdminReason(resultCase),
    adminReviewStartedAt: iso(resultCase.adminReviewStartedAt),
    // Lý do Admin viết cho cả kèo; không có ghi chú nội bộ của AI, không có người quyết, uy tín hay vi phạm.
    adminDecision: adminDecision && { outcome: adminDecision.outcome, reason: adminDecision.reason, decidedAt: adminDecision.createdAt.toISOString() },
    evidenceDoneSides: [...new Set(responses.filter((row) => row.kind === 'evidence_done').map((row) => sideOf(teams, row.userId)))]
      .filter((side): side is TeamSide => side !== null).sort(),
  };
}
