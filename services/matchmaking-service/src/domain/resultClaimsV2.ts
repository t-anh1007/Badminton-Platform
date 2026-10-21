import type { Match, MatchResultCase, Prisma, TeamSide } from '@prisma/client';
import type { OcrReading } from '@khoaluantn/ai';
import type { AccountClient } from '../clients/account.js';
import { aiSettings } from '../lib/aiClients.js';
import { AppError } from '../lib/errors.js';
import { writeResultNotification } from '../lib/notificationOutbox.js';
import { prisma } from '../lib/prisma.js';
import { buildDraft, classifyClaim, classifyImage, publicReasons, type Draft } from './confidence.js';
import { deadlineFor, resultWindows, type Level } from './deadlines.js';
import { InvalidScoreError, inferMatchOutcome, type MatchOutcome, type SetScore } from './matchRules.js';
import { adminReviewNotification, lockMatch, notifyRoster, resultTeams } from './matchResults.js';
import { imageInput, teamNames } from './resultOcr.js';
import { enterAdminReview, writeResultFinal } from './resultLifecycle.js';
import { reputationOf } from './reputation.js';

// Bản khai bằng ảnh, kết quả đề xuất, đội thua chấp nhận (BR-RA-01..07, 20..29) cho hồ sơ ra_v1.

type Tx = Prisma.TransactionClient;
type Teams = Record<TeamSide, string[]>;

/** BR-RA-02: 7 ảnh/người/hồ sơ (kể cả ảnh tranh chấp), không tính 2 ảnh kháng nghị. */
export const RESULT_EVIDENCE_MAX_PER_USER_V2 = 7;
const LEVEL_RANK: Record<Level, number> = { green: 0, yellow: 1, red: 2 };

/** Giờ Việt Nam dạng "HH:MM dd/MM" cho nội dung thông báo. */
export function vnClock(date: Date): string {
  const local = new Date(date.getTime() + 7 * 3_600_000).toISOString();
  return `${local.slice(11, 16)} ${local.slice(8, 10)}/${local.slice(5, 7)}`;
}

export function sideOf(teams: Teams, userId: string): TeamSide | null {
  return teams.A.includes(userId) ? 'A' : teams.B.includes(userId) ? 'B' : null;
}

export function otherSide(side: TeamSide): TeamSide {
  return side === 'A' ? 'B' : 'A';
}

const claimInclude = { sets: { orderBy: { position: 'asc' } }, evidence: { orderBy: { position: 'asc' } } } satisfies Prisma.ResultClaimInclude;
export type CurrentClaim = Prisma.ResultClaimGetPayload<{ include: typeof claimInclude }>;

/** Bản khai hiện hành: purpose `claim`, bỏ các bản đã bị thay (BR-RA-05), theo giờ server tăng dần. */
export async function currentClaims(db: Tx | typeof prisma, caseId: string): Promise<CurrentClaim[]> {
  const claims = await db.resultClaim.findMany({
    where: { caseId, purpose: 'claim' }, include: claimInclude, orderBy: { createdAt: 'asc' },
  });
  const superseded = new Set(claims.map((claim) => claim.supersedesClaimId).filter(Boolean));
  return claims.filter((claim) => !superseded.has(claim.id));
}

/** Kết quả đề xuất = bản hiện hành sớm nhất; bản thay kế thừa vị trí bản gốc. */
export function proposalOf(claims: CurrentClaim[]): CurrentClaim | null {
  return claims[0] ?? null;
}

/** Đội bị xử thua theo kết quả đề xuất; NO_RESULT → đội không phải đội đề xuất (BR-RA-22). */
export function losingTeamOf(outcome: MatchOutcome, proposerSide: TeamSide): TeamSide {
  if (outcome === 'TEAM_A_WIN') return 'B';
  if (outcome === 'TEAM_B_WIN') return 'A';
  return otherSide(proposerSide);
}

interface DraftUpload {
  id: string; objectKey: string; mimeType: string; size: number; checksumSha256: string; capturedAt: Date | null;
  dhash: string; exactDuplicateOfId: string | null; nearDuplicateOfId: string | null; isScreenshot: boolean;
  reading: OcrReading | null;
}

export interface SubmissionInput {
  draftId: string;
  sets: SetScore[];
  columnMapping: 'left_is_A' | 'left_is_B' | null;
  editedCells: Array<{ set: number; side: 'A' | 'B' }>;
  outcome?: 'NO_RESULT';
}

export interface PreparedSubmission {
  uploads: DraftUpload[];
  draft: Draft;
  level: Level;
  reasons: string[];
  outcome: MatchOutcome;
  setWinsA: number;
  setWinsB: number;
  input: SubmissionInput;
}

/** Tính lại mức từ EvidenceReading của bản nháp, không tin mức do FE gửi (tech design §4.1 bước 6). */
export async function prepareSubmission(
  match: Match, resultCase: MatchResultCase, teams: Teams, userId: string, input: SubmissionInput,
  deps: { accountClient?: AccountClient; now: Date },
): Promise<PreparedSubmission> {
  const rows = await prisma.resultUpload.findMany({
    where: { caseId: resultCase.id, userId, draftId: input.draftId },
    include: { readings: { orderBy: { createdAt: 'desc' } } },
    orderBy: { createdAt: 'asc' },
  });
  if (rows.length === 0) throw new AppError(404, 'RESULT_DRAFT_NOT_FOUND', 'Không tìm thấy bản nháp ảnh; hãy tải ảnh lại.');
  const uploads: DraftUpload[] = rows.map(({ readings, ...row }) => ({
    ...row, reading: (readings.find((item) => item.ok)?.reading ?? null) as OcrReading | null,
  }));
  const window = { startAt: match.startAt ?? deps.now, endAt: match.endAt ?? deps.now };
  const draft = buildDraft(uploads.map((upload) => imageInput(upload, upload.reading)), {
    format: match.format, teams: await teamNames(deps.accountClient, teams), match: window, cellThreshold: aiSettings().cellConfidence,
  });
  let classified: ReturnType<typeof classifyClaim>;
  let setWins: { setWinsA: number; setWinsB: number };
  try {
    classified = classifyClaim(draft, {
      sets: input.sets, columnMappedBy: input.columnMapping ? 'user' : 'ai', editedCells: input.editedCells,
    }, { reputation: await reputationOf(userId, deps.now) });
    setWins = inferMatchOutcome({ format: match.format, sets: input.sets });
  } catch (error) {
    if (error instanceof InvalidScoreError) throw new AppError(400, 'RESULT_SCORE_INVALID', 'Tỷ số không hợp lệ theo luật cầu lông.');
    throw error;
  }
  if (input.outcome && input.outcome !== classified.outcome) {
    throw new AppError(400, 'RESULT_SCORE_INVALID', 'Tỷ số không cho kết quả không phân thắng thua.');
  }
  return { uploads, draft, ...classified, setWinsA: setWins.setWinsA, setWinsB: setWins.setWinsB, input };
}

/** Chèn bản khai/bản nộp kèm ảnh (chỉ ghi thêm). Ảnh lúc này mới tính vào hạn mức 7 ảnh. */
export async function insertSubmission(
  tx: Tx, resultCase: MatchResultCase, match: Match, userId: string, prepared: PreparedSubmission,
  options: { purpose: 'claim' | 'evidence'; supersedesClaimId?: string; now: Date },
) {
  const uploadIds = prepared.uploads.map((upload) => upload.id);
  if (await tx.resultEvidence.count({ where: { uploadId: { in: uploadIds } } }) > 0) {
    throw new AppError(409, 'RESULT_DRAFT_USED', 'Ảnh của bản nháp này đã được gửi.');
  }
  const used = await tx.resultEvidence.count({ where: { caseId: resultCase.id, ownerUserId: userId, purpose: { not: 'appeal' } } });
  if (used + uploadIds.length > RESULT_EVIDENCE_MAX_PER_USER_V2) {
    throw new AppError(409, 'RESULT_EVIDENCE_LIMIT', 'Mỗi người tối đa 7 ảnh cho một hồ sơ.');
  }
  const claim = await tx.resultClaim.create({
    data: {
      caseId: resultCase.id, claimantUserId: userId, outcome: prepared.outcome,
      setWinsA: prepared.setWinsA, setWinsB: prepared.setWinsB, createdAt: options.now,
      level: prepared.level, levelReasons: prepared.reasons, manualEntry: prepared.draft.manualEntry,
      columnMappedBy: prepared.input.columnMapping ? 'user' : 'ai', editedCells: prepared.input.editedCells,
      supersedesClaimId: options.supersedesClaimId ?? null, draftId: prepared.input.draftId, purpose: options.purpose,
      sets: { create: prepared.input.sets.map((set, position) => ({ position, teamA: set.teamA, teamB: set.teamB })) },
    },
  });
  const window = { startAt: match.startAt ?? options.now, endAt: match.endAt ?? options.now };
  await tx.resultEvidence.createMany({
    data: prepared.uploads.map((upload, index) => {
      const image = classifyImage(imageInput(upload, upload.reading), window);
      return {
        caseId: resultCase.id, objectKey: upload.objectKey, mimeType: upload.mimeType, size: upload.size,
        checksumSha256: upload.checksumSha256, ownerUserId: userId, claimId: claim.id, position: used + index,
        createdAt: options.now, uploadId: upload.id, capturedAt: upload.capturedAt, dhash: upload.dhash,
        exactDuplicateOfId: upload.exactDuplicateOfId, nearDuplicateOfId: upload.nearDuplicateOfId,
        level: image.level, levelReasons: image.reasons, supports: prepared.outcome, purpose: options.purpose,
      };
    }),
  });
  return claim;
}

export interface CaseContext { match: Match; teams: Teams; resultCase: MatchResultCase }

/** Người trả thay (chủ kèo) của partner; null nếu partner tự trả. */
async function payerOf(tx: Tx, matchId: string, userId: string): Promise<string | null> {
  const join = await tx.join.findFirst({
    where: { matchId, participantUserId: userId, status: 'confirmed', payerUserId: { not: null } }, select: { payerUserId: true },
  });
  return join?.payerUserId && join.payerUserId !== userId ? join.payerUserId : null;
}

/**
 * BR-RA-22/23/17: một thành viên đội bị xử thua đã chấp nhận (Đồng ý / bản cùng bên thắng / tự khai thua) — caller đã ghi
 * hành động đó. Đơn → final; đôi → grace 1 giờ hoặc final khi cả đội đã chấp nhận; partner được trả thay không chốt sớm
 * khi người trả chưa chấp nhận; bản Đỏ → Admin.
 */
export async function acceptByLosingTeam(
  tx: Tx, ctx: CaseContext, actorUserId: string, now: Date,
): Promise<'final' | 'grace' | 'pending_payer' | 'admin'> {
  const { match, teams, resultCase } = ctx;
  const claims = await currentClaims(tx, resultCase.id);
  const proposal = proposalOf(claims)!;
  const outcome = resultCase.outcome!;
  const losers = teams[losingTeamOf(outcome, sideOf(teams, proposal.claimantUserId)!)];
  if (proposal.level === 'red') {
    await tx.matchResultCase.update({ where: { id: resultCase.id }, data: enterAdminReview(now) });
    await writeResultNotification(tx, adminReviewNotification(match.id, resultCase.id, 'match.result.admin_review', 'Kết quả có ảnh lạ cần Admin quyết định'));
    return 'admin';
  }
  const confirmed = await tx.resultResponse.findMany({ where: { caseId: resultCase.id, kind: 'confirm' }, select: { userId: true } });
  const accepted = new Set([
    actorUserId,
    ...confirmed.map((row) => row.userId),
    ...claims.filter((claim) => claim.outcome === outcome).map((claim) => claim.claimantUserId),
  ].filter((userId) => losers.includes(userId)));
  const payer = await payerOf(tx, match.id, actorUserId);
  if (payer && losers.includes(payer) && !accepted.has(payer)) {
    await writeResultNotification(tx, {
      recipients: [{ type: 'user', userId: payer, targetRole: 'player' }],
      kind: 'match.result.payer_needed', title: 'Đồng đội bạn trả thay đã chấp nhận kết quả',
      body: 'Kết quả chỉ chốt sớm khi chính bạn cũng chấp nhận; nếu không, kết quả chờ hết hạn phản hồi.',
      matchId: match.id, caseId: resultCase.id, actionKind: 'match.result.view',
    });
    return 'pending_payer';
  }
  if (losers.every((userId) => accepted.has(userId))) {
    await writeResultFinal(tx, resultCase, outcome, resultCase.id, now);
    return 'final';
  }
  if (resultCase.status === 'acceptance_grace') return 'grace';
  const grace = deadlineFor(now, resultWindows().grace);
  await tx.matchResultCase.update({
    where: { id: resultCase.id },
    data: { status: 'acceptance_grace', graceDeadlineAt: grace.at, version: { increment: 1 } },
  });
  await notifyRoster(tx, match, resultCase.id, 'match.result.grace', 'Một người đội thua đã chấp nhận kết quả',
    `Người còn lại của đội có tới ${vnClock(grace.at)} để phản đối; quá hạn kết quả sẽ được chốt.`);
  return 'grace';
}

/** Hạn phản hồi đang mở (proposed / grace). */
export function responseOpenUntil(resultCase: MatchResultCase): Date | null {
  if (resultCase.status === 'proposed') return resultCase.responseDeadlineAt;
  if (resultCase.status === 'acceptance_grace') return resultCase.graceDeadlineAt;
  return null;
}

export async function lockedCaseV2(tx: Tx, matchId: string, userId: string): Promise<CaseContext> {
  await lockMatch(tx, matchId);
  const match = await tx.match.findUnique({ where: { id: matchId }, include: { resultCase: true } });
  if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
  const teams = await resultTeams(tx, match);
  if (!sideOf(teams, userId)) throw new AppError(403, 'RESULT_ROSTER_ONLY', 'Chỉ người trong kèo được thao tác với kết quả.');
  if (!match.resultCase) throw new AppError(404, 'RESULT_CASE_NOT_FOUND', 'Kèo chưa mở khai kết quả.');
  const { resultCase, ...rest } = match;
  return { match: rest as Match, teams, resultCase };
}

/** Hồ sơ chuyển sang tranh chấp tỉ số (BR-RA-24); cửa sổ bằng chứng do Task 12 quản lý. */
export type DisputeOpener = (tx: Tx, ctx: CaseContext, now: Date) => Promise<void>;

/**
 * POST /result-claims (ra_v1). Bản đầu → kết quả đề xuất; bản sau cùng/khác bên thắng xử theo BR-RA-03/22/24/29;
 * thay bản của chính mình theo BR-RA-05.
 */
export async function submitClaimV2(
  input: SubmissionInput & { matchId: string; userId: string },
  deps: { accountClient?: AccountClient; now?: Date; openDispute: DisputeOpener },
) {
  const now = deps.now ?? new Date();
  const match = await prisma.match.findUnique({ where: { id: input.matchId }, include: { resultCase: true } });
  if (!match?.resultCase) throw new AppError(404, 'RESULT_CASE_NOT_FOUND', 'Kèo chưa mở khai kết quả.');
  const teams = await resultTeams(prisma, match);
  const side = sideOf(teams, input.userId);
  if (!side) throw new AppError(403, 'RESULT_ROSTER_ONLY', 'Chỉ người trong kèo được khai kết quả.');
  const prepared = await prepareSubmission(match, match.resultCase, teams, input.userId, input, { accountClient: deps.accountClient, now });

  return prisma.$transaction(async (tx) => {
    const ctx = await lockedCaseV2(tx, input.matchId, input.userId);
    const { resultCase } = ctx;
    const windows = resultWindows();
    const claims = await currentClaims(tx, resultCase.id);
    const proposal = proposalOf(claims);
    const own = claims.find((claim) => claim.claimantUserId === input.userId);
    const openUntil = responseOpenUntil(resultCase);

    if (own) {
      // BR-RA-05: thay bản của chính mình khi đội kia chưa phản hồi và đồng đội chưa có bản khác.
      const others = claims.filter((claim) => claim.id !== own.id);
      const responses = await tx.resultResponse.count({ where: { caseId: resultCase.id } });
      const canReplace = resultCase.status === 'proposed' && proposal?.id === own.id && now < resultCase.declarationDeadlineAt
        && others.length === 0 && responses === 0;
      if (!canReplace) throw new AppError(409, 'RESULT_REPLACE_CLOSED', 'Không thể thay bản khai lúc này.');
      const claim = await insertSubmission(tx, resultCase, ctx.match, input.userId, prepared, { purpose: 'claim', supersedesClaimId: own.id, now });
      return propose(tx, ctx, claim.id, input.userId, prepared, now, windows, 'replaced');
    }

    if (resultCase.status === 'declaration_open') {
      if (now >= resultCase.declarationDeadlineAt) throw new AppError(409, 'RESULT_DECLARATION_CLOSED', 'Đã hết thời gian khai kết quả.');
      const claim = await insertSubmission(tx, resultCase, ctx.match, input.userId, prepared, { purpose: 'claim', now });
      return propose(tx, ctx, claim.id, input.userId, prepared, now, windows, 'first');
    }

    // BR-RA-27: khi đã có kết quả đề xuất, bản khai là phản hồi, được tới hết cửa sổ phản hồi.
    if (!proposal || !openUntil || now >= openUntil) {
      throw new AppError(409, 'RESULT_DECLARATION_CLOSED', 'Hồ sơ không còn nhận bản khai.');
    }
    const claim = await insertSubmission(tx, resultCase, ctx.match, input.userId, prepared, { purpose: 'claim', now });
    const proposerSide = sideOf(ctx.teams, proposal.claimantUserId)!;
    let caseStatus: string = resultCase.status;
    if (prepared.outcome !== resultCase.outcome) {
      await deps.openDispute(tx, ctx, now);
      caseStatus = 'evidence_window';
    } else if (side === proposerSide) {
      // BR-RA-29: đồng đội cùng bên thắng ở mức cao hơn rút ngắn cửa sổ, không bao giờ kéo dài.
      const shorter = deadlineFor(proposal.createdAt, windows[prepared.level]);
      const shorten = resultCase.status === 'proposed' && LEVEL_RANK[prepared.level] < LEVEL_RANK[proposal.level ?? 'yellow']
        && resultCase.responseDeadlineAt && shorter.at < resultCase.responseDeadlineAt;
      await tx.matchResultCase.update({
        where: { id: resultCase.id },
        data: shorten
          ? { responseDeadlineBaseAt: shorter.baseAt, responseDeadlineAt: shorter.at, version: { increment: 1 } }
          : { version: { increment: 1 } },
      });
    } else {
      caseStatus = await acceptByLosingTeam(tx, ctx, input.userId, now).then(statusAfterAccept);
    }
    return claimResult(tx, resultCase.id, claim.id, prepared, caseStatus);
  });
}

function statusAfterAccept(result: Awaited<ReturnType<typeof acceptByLosingTeam>>): string {
  return { final: 'final', grace: 'acceptance_grace', pending_payer: 'proposed', admin: 'admin_review' }[result];
}

async function claimResult(tx: Tx, caseId: string, claimId: string, prepared: PreparedSubmission, caseStatus: string) {
  const fresh = await tx.matchResultCase.findUniqueOrThrow({ where: { id: caseId } });
  return {
    claimId, level: prepared.level, reasons: publicReasons(prepared.reasons), outcome: prepared.outcome,
    caseStatus: fresh.status === caseStatus ? caseStatus : fresh.status,
    responseDeadlineAt: fresh.responseDeadlineAt?.toISOString() ?? null, version: fresh.version,
  };
}

/** Mở (hoặc mở lại khi thay bản) cửa sổ phản hồi theo mức (BR-RA-20); tự khai thua → đội thua chấp nhận (BR-RA-04). */
async function propose(
  tx: Tx, ctx: CaseContext, claimId: string, claimantUserId: string, prepared: PreparedSubmission, now: Date,
  windows: ReturnType<typeof resultWindows>, kind: 'first' | 'replaced',
) {
  const { resultCase, match, teams } = ctx;
  const deadline = deadlineFor(now, windows[prepared.level]);
  const updated = await tx.matchResultCase.update({
    where: { id: resultCase.id },
    data: {
      status: 'proposed', outcome: prepared.outcome, responseDeadlineBaseAt: deadline.baseAt, responseDeadlineAt: deadline.at,
      version: { increment: 1 },
    },
  });
  const levelText = { green: 'Xanh', yellow: 'Vàng', red: 'Đỏ' }[prepared.level];
  const reasons = publicReasons(prepared.reasons);
  await notifyRoster(tx, match, resultCase.id, 'match.result.proposed',
    kind === 'first' ? 'Đã có kết quả đề xuất của trận' : 'Kết quả đề xuất đã được thay',
    `Mức tin cậy ${levelText}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}. Hạn phản hồi ${vnClock(deadline.at)}`
      + (prepared.level === 'red' ? '; bản có ảnh lạ sẽ được Admin xem xét, không tự chốt.' : '; quá hạn kết quả sẽ được chốt.'));
  let caseStatus: string = 'proposed';
  const claimantSide = sideOf(teams, claimantUserId)!;
  if (prepared.outcome !== 'NO_RESULT' && losingTeamOf(prepared.outcome, claimantSide) === claimantSide) {
    caseStatus = statusAfterAccept(await acceptByLosingTeam(tx, { ...ctx, resultCase: updated }, claimantUserId, now));
  }
  return claimResult(tx, resultCase.id, claimId, prepared, caseStatus);
}
