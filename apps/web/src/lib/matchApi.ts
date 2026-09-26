import { publishDataInvalidation } from '../realtime/dataInvalidation.js';
const BASE_URL = import.meta.env.VITE_MATCHMAKING_URL ?? '/api/matchmaking';

// DM3 (PLAN_MATCH-DEPOSIT): khớp MIN_LEAD_HOURS ở matchmaking-service — chỉ tạo kèo khi slot còn >= 24 giờ.
export const MATCH_MIN_LEAD_HOURS = 24;

export class MatchApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'MatchApiError';
    this.status = status;
    this.code = code;
  }
}

function token(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('accessToken');
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = token();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: string };
  };
  if (!response.ok) throw new MatchApiError(body.error?.message ?? 'Không thể xử lý yêu cầu kèo.', response.status, body.error?.code);
  if (init?.method && init.method !== 'GET') publishDataInvalidation();
  return body;
}

export type SkillTier = 'newcomer' | 'beginner' | 'intermediate' | 'intermediate_plus' | 'advanced';
export type MatchSourceType = 'hold' | 'paid_booking';
export type MatchMode = 'friendly' | 'ranked';
export type MatchDiscipline = 'singles' | 'doubles';
export type MatchRatio = '5:5' | '6:4' | '7:3';
export type MatchFormat = 'bo3' | 'bo5';
export type TeamSide = 'A' | 'B';
/** Cấu hình kèo cạnh tranh v2; khóa sau khi công bố. Kèo cũ có thể thiếu các trường này. */
export interface MatchConfig {
  sourceType?: MatchSourceType;
  mode?: MatchMode;
  discipline?: MatchDiscipline;
  ratio?: MatchRatio;
  format?: MatchFormat;
}
/** Số tiền do backend tính (chuỗi VND); React chỉ định dạng, không tự tính. */
export interface MatchFundingView {
  bookingPrice: string;
  totalContribution: string;
  resultHeldAmount: string;
  regularSlotAmount: string;
  organizerContribution: string | null;
  viewerAdditionalAmountDue: string | null;
  organizerRefundAtLock: string | null;
  organizerRefundWithdrawable: boolean | null;
}
export interface MatchFundingPreview {
  bookingPrice: string;
  resultHeldAmount: string;
  regularSlotAmount: string;
  organizerContribution: string;
  alreadyPaid: string;
  additionalOwnerCharge: string;
  organizerRefundAtLock: string;
  netCostIfWin: string;
  netCostIfLose: string;
}
export interface MatchParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  teamSide: TeamSide;
  role: 'organizer' | 'participant';
  paymentState: 'paid' | 'awaiting_payment';
}
export type JoinStatus = 'pending' | 'approved' | 'confirmed';
export interface MatchVenue {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}
export interface MatchCourt {
  id: string;
  name: string;
}
export interface ScheduleConflict {
  kind: 'match' | 'booking';
  role: 'organizer' | 'participant' | 'booker';
  startAt: string;
  endAt: string;
  court: MatchCourt;
  venue: Pick<MatchVenue, 'id' | 'name' | 'address'>;
}
export interface MatchRow extends MatchConfig {
  businessCode?: string;
  id: string;
  status: 'open' | 'filled' | 'confirmed';
  paymentPending: boolean;
  organizerUserId: string;
  capacity: number;
  openSlots: number;
  feePerSlot: string;
  skillMin: SkillTier | null;
  skillMax: SkillTier | null;
  cutoffAt: string;
  startAt: string;
  endAt: string;
  court: MatchCourt;
  venue: MatchVenue;
  organizer?: { displayName: string; avatarUrl: string | null; identityVisibility: 'public' | 'hidden'; tier?: SkillTier | null } | null;
}
export interface OwnJoin {
  id: string;
  status: JoinStatus;
  approvedAt: string | null;
}
export interface MatchDetail extends Omit<MatchRow, 'organizerUserId' | 'status'> {
  status: 'awaiting_deposit' | 'open' | 'filled' | 'confirmed' | 'completed';
  skillConfiguredAt: string | null;
  organizer: {
    displayName: string;
    avatarUrl: string | null;
    identityVisibility: 'public' | 'hidden';
    tier: SkillTier | null;
  };
  confirmedParticipants: number;
  confirmedParticipantProfiles?: Array<{
    displayName: string;
    avatarUrl: string | null;
    identityVisibility: 'public' | 'hidden';
  }>;
  bookingPrice?: string | null;
  teamSlots?: Array<{ side: TeamSide; size: number; open: number }>;
  participants?: MatchParticipant[];
  funding?: MatchFundingView | null;
  actions: {
    canJoin: boolean;
    isOrganizer: boolean;
    canPayOrganizerContribution: boolean;
    ownJoin: OwnJoin | null;
    canJoinTeamA?: boolean;
    canJoinTeamB?: boolean;
    canPay?: boolean;
    canWithdrawBeforeLock?: boolean;
    canReportIncident?: boolean;
  };
}
export interface PendingJoin extends OwnJoin {
  participantUserId: string;
  participantTier: SkillTier | null;
  compatibilityScore: number;
  compatibilityExplanation: string;
}
export interface AdminEvaluationRow {
  id: string;
  matchId: string;
  perceivedTier: SkillTier | null;
  flagReason: string | null;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
  rater: { label: string };
  ratee: { label: string };
  match: { status: string; completedAt: string | null };
}

export function listMatches(
  filters: { area?: string; skill?: SkillTier; startFrom?: string; endBefore?: string; feeMax?: string } = {},
) {
  const query = new URLSearchParams();
  if (filters.area) query.set('area', filters.area);
  if (filters.skill) query.set('skill', filters.skill);
  if (filters.startFrom) query.set('startFrom', filters.startFrom);
  if (filters.endBefore) query.set('endBefore', filters.endBefore);
  if (filters.feeMax) query.set('feeMax', filters.feeMax);
  return api<{ matches: MatchRow[] }>(`/matches${query.size ? `?${query}` : ''}`);
}
export const getMatchDetail = (id: string) => api<MatchDetail>(`/matches/${id}`);
export const configureMatchSkillRange = (id: string, input: { skillMin: SkillTier; skillMax: SkillTier }) =>
  api<{ id: string; skillMin: SkillTier; skillMax: SkillTier; skillConfiguredAt: string }>(`/matches/${id}/skill-range`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
export const getMyConfirmedMatches = () => api<{ matches: MyConfirmedMatch[] }>('/matches/me/history');
export function getMyScheduleConflicts(input: { startAt: string; endAt: string; excludeMatchId?: string }) {
  const query = new URLSearchParams({ startAt: input.startAt, endAt: input.endAt });
  if (input.excludeMatchId) query.set('excludeMatchId', input.excludeMatchId);
  return api<{ conflicts: ScheduleConflict[] }>(`/matches/me/schedule-conflicts?${query}`);
}
export async function waitForMatchOpen(id: string, options: { attempts?: number; intervalMs?: number } = {}) {
  const attempts = options.attempts ?? 20;
  const intervalMs = options.intervalMs ?? 1_000;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const detail = await getMatchDetail(id);
    if (detail.status === 'open' || detail.status === 'filled' || detail.status === 'confirmed') return detail;
    if (detail.status !== 'awaiting_deposit') throw new Error('Kèo không còn ở trạng thái có thể hoàn tất đặt cọc.');
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Khoản cọc đang được xác nhận. Vui lòng chờ thêm hoặc thử kiểm tra lại.');
}
export interface MyConfirmedMatch {
  businessCode?: string;
  id: string;
  status: 'confirmed' | 'completed';
  participationRole: 'organizer' | 'participant';
  participationLabel: 'Kèo đã tham gia';
  feePerSlot: string;
  startAt: string;
  endAt: string;
  court: MatchCourt;
  venue: MatchVenue;
}
export const requestMatchJoin = (id: string, teamSide: TeamSide) =>
  api<OwnJoin & { matchId: string }>(`/matches/${id}/joins`, {
    method: 'POST',
    body: JSON.stringify({ teamSide }),
  });
export const listPendingMatchJoins = (id: string) => api<{ joins: PendingJoin[] }>(`/matches/${id}/joins/pending`);
export const approveMatchJoin = (matchId: string, joinId: string) =>
  api<OwnJoin>(`/matches/${matchId}/joins/${joinId}/approve`, {
    method: 'POST',
  });
export const rejectMatchJoin = (matchId: string, joinId: string) =>
  api<OwnJoin>(`/matches/${matchId}/joins/${joinId}/reject`, {
    method: 'POST',
  });
export const withdrawMatchJoin = (matchId: string, joinId: string) =>
  api(`/matches/${matchId}/joins/${joinId}/withdraw`, { method: 'POST' });
export const cancelMatch = (id: string) => api(`/matches/${id}/cancel`, { method: 'POST' });
export const abandonMatch = (id: string) => api(`/matches/${id}/cancel`, { method: 'POST', keepalive: true });
export const abandonMatchJoin = (matchId: string, joinId: string) =>
  api(`/matches/${matchId}/joins/${joinId}/withdraw`, { method: 'POST', keepalive: true });
/** Body strict của Task 5: nguồn là hold hoặc booking đã thanh toán, cùng cấu hình khóa khi công bố. */
export const createMatch = (body: ({ bookingId: string; holdId?: never } | { holdId: string; bookingId?: never }) & {
  mode: MatchMode;
  discipline: MatchDiscipline;
  ratio: MatchRatio;
  format: MatchFormat;
  skillMin?: SkillTier;
  skillMax?: SkillTier;
}) => api<MatchRow>('/matches', { method: 'POST', body: JSON.stringify(body) });
export async function getFundingPreview(input: { price: string; ratio: MatchRatio; discipline: MatchDiscipline; sourceType: MatchSourceType }) {
  const query = new URLSearchParams(input);
  return (await api<{ preview: MatchFundingPreview }>(`/matches/funding-preview?${query}`)).preview;
}
export async function getAdminEvaluations(reviewStatus: AdminEvaluationRow['reviewStatus'] = 'pending') {
  const result = await api<{ evaluations: AdminEvaluationRow[] }>(`/matches/admin/evaluations?reviewStatus=${reviewStatus}`);
  return result.evaluations;
}
export const reviewAdminEvaluation = (matchId: string, evaluationId: string, decision: 'approve' | 'reject') =>
  api(`/matches/${matchId}/evaluations/${evaluationId}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ decision }),
  });

// ---- Task 24: hồ sơ kết quả trận (Tasks 11-13) ----
export type MatchOutcome = 'TEAM_A_WIN' | 'TEAM_B_WIN' | 'NO_RESULT';
export type ResultCaseStatus = 'declaration_open' | 'provisional' | 'incident_window' | 'provider_review' | 'admin_review' | 'final';
export type IncidentType = 'no_show' | 'not_played' | 'interrupted' | 'other';
export interface SetScore { teamA: number; teamB: number }
export interface ResultIdentity { userId: string; displayName: string; avatarUrl: string | null }
export interface EvidenceInput { objectKey: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; checksumSha256?: string }
export interface PlayerResultCase {
  matchId: string;
  serverNow: string;
  status: ResultCaseStatus;
  finalOutcome: MatchOutcome | null;
  declarationDeadlineAt: string | null;
  objectionDeadlineAt: string | null;
  teamGraceDeadlineAt: string | null;
  match: {
    discipline: MatchDiscipline; mode: MatchMode; format: MatchFormat; ratio: MatchRatio;
    startAt: string; endAt: string; venue: { name: string; address: string }; court: { name: string };
    teams: Array<{ side: TeamSide; players: ResultIdentity[] }>;
  };
  provisional: null | { claimant: ResultIdentity; sets: SetScore[]; outcome: MatchOutcome; evidence: Array<{ id: string; mimeType: string }> };
  viewerActions: { canClaim: boolean; canConfirm: boolean; canObject: boolean; canReportIncident: boolean };
  viewerMoney: null | { heldForResult: string; projectedReceivable: string; projectedFinalCost: string; withdrawableIfFinal: boolean };
}
export interface ResultUploadAuthorization { objectKey: string; uploadUrl: string; headers: Record<string, string>; expiresAt: string }

export const getResultCase = async (matchId: string) => (await api<{ resultCase: PlayerResultCase }>(`/matches/${matchId}/result-case`)).resultCase;
export async function authorizeResultEvidence(matchId: string, mimeType: EvidenceInput['mimeType'], metadata?: { size: number; checksumSha256: string }) {
  if (!metadata) throw new Error('Cần mã kiểm tra ảnh trước khi tải lên.');
  return (await api<{ upload: ResultUploadAuthorization }>(`/matches/${matchId}/result-evidence/uploads`, {
    method: 'POST', body: JSON.stringify({ mimeType, ...metadata }),
  })).upload;
}
export const submitResultClaim = (matchId: string, body: { sets: SetScore[]; evidence: EvidenceInput[] }) =>
  api(`/matches/${matchId}/result-claims`, { method: 'POST', body: JSON.stringify(body) });
export const supplementResultEvidence = (matchId: string, evidence: EvidenceInput[]) =>
  api(`/matches/${matchId}/result-evidence`, { method: 'POST', body: JSON.stringify({ evidence }) });
export const confirmMatchResult = (matchId: string) => api(`/matches/${matchId}/result-responses/confirm`, { method: 'POST' });
export const objectMatchResult = (matchId: string, body: { reason: string; evidence: EvidenceInput[] }) =>
  api(`/matches/${matchId}/result-responses/object`, { method: 'POST', body: JSON.stringify(body) });
export const reportMatchIncident = (matchId: string, body: { type: IncidentType; description: string; evidence: EvidenceInput[] }) =>
  api(`/matches/${matchId}/incidents`, { method: 'POST', body: JSON.stringify(body) });
export const readResultEvidence = (matchId: string, evidenceId: string) =>
  api<{ url: string }>(`/matches/${matchId}/result-evidence/${evidenceId}/read`);

/** Chỉ để xem trước trên form; backend suy ra kết quả chính thức khi nhận bản khai (BR-CM-24). */
export function previewOutcome(format: MatchFormat, sets: SetScore[]): { outcome: MatchOutcome; setWinsA: number; setWinsB: number } | null {
  const need = format === 'bo5' ? 3 : 2;
  let setWinsA = 0; let setWinsB = 0; let unfinished: SetScore | null = null;
  for (const [index, set] of sets.entries()) {
    const high = Math.max(set.teamA, set.teamB); const low = Math.min(set.teamA, set.teamB);
    if (setWinsA === need || setWinsB === need) return null;
    const done = (high === 21 && low <= 19) || (high >= 22 && high <= 30 && high - low === 2) || (high === 30 && low === 29);
    if (done) { if (set.teamA > set.teamB) setWinsA += 1; else setWinsB += 1; continue; }
    if (index === sets.length - 1 && (high <= 20 || (high <= 29 && high - low <= 1))) { unfinished = set; continue; }
    return null;
  }
  if (sets.length === 0) return null;
  const outcome: MatchOutcome = setWinsA !== setWinsB ? (setWinsA > setWinsB ? 'TEAM_A_WIN' : 'TEAM_B_WIN')
    : unfinished && unfinished.teamA !== unfinished.teamB ? (unfinished.teamA > unfinished.teamB ? 'TEAM_A_WIN' : 'TEAM_B_WIN') : 'NO_RESULT';
  return { outcome, setWinsA, setWinsB };
}

/** Task 13: hàng chờ và hồ sơ cho chủ sân (đề xuất không ràng buộc) và Admin (quyết định cuối). */
export interface ReviewQueueItem {
  caseId: string; matchId: string; status: ResultCaseStatus; version: number;
  discipline: MatchDiscipline; mode: MatchMode; startAt: string | null; endAt: string | null;
  providerDeadlineAt: string | null; adminReviewStartedAt: string | null; adminOverdue: boolean;
}
export interface ReviewCaseDetail extends ReviewQueueItem {
  serverNow: string;
  declarationDeadlineAt: string; objectionDeadlineAt: string | null; incidentDeadlineAt: string | null;
  booking: null | { startAt: string; endAt: string; venue: { name: string; address: string }; court: { name: string } };
  match: { discipline: MatchDiscipline; mode: MatchMode; format: MatchFormat; ratio: MatchRatio; teams: Array<{ side: TeamSide; players: ResultIdentity[] }> };
  claims: Array<{ id: string; claimant: ResultIdentity; outcome: MatchOutcome; sets: SetScore[]; evidenceIds: string[]; createdAt: string }>;
  responses: Array<{ id: string; user: ResultIdentity; kind: string; incidentType: IncidentType | null; reason: string | null; evidenceIds: string[]; createdAt: string }>;
  supplementalEvidence: Array<{ id: string; ownerUserId: string }>;
  providerRecommendation: null | { outcome: MatchOutcome; reason: string; createdAt: string; nonBinding: true };
  actions: { canRecommend?: boolean; canPreviewDecision?: boolean };
}
export interface AdminDecisionPreview {
  caseVersion: number; previewToken: string; outcome: MatchOutcome; reason: string;
  rows: Array<{ userId: string; displayName: string; amount: string; withdrawable: true }>;
  ratingEffect: 'apply_ranked_result' | 'no_change'; bookingRevenueEffect: 'no_change';
}
type ReviewPage = { items: ReviewQueueItem[]; total: number; page: number; pageSize: number };
const reviewQuery = (page: number) => `?${new URLSearchParams({ page: String(page), pageSize: '10' })}`;
export const listProviderResultCases = (page = 1) => api<ReviewPage>(`/matches/provider/result-cases${reviewQuery(page)}`);
export const getProviderResultCase = async (caseId: string) => (await api<{ resultCase: ReviewCaseDetail }>(`/matches/provider/result-cases/${caseId}`)).resultCase;
export const submitProviderRecommendation = (matchId: string, body: { outcome: MatchOutcome; reason: string }) =>
  api(`/matches/${matchId}/provider-recommendation`, { method: 'POST', body: JSON.stringify(body) });
export const listAdminResultCases = (page = 1) => api<ReviewPage>(`/matches/admin/result-cases${reviewQuery(page)}`);
export const getAdminResultCase = async (caseId: string) => (await api<{ resultCase: ReviewCaseDetail }>(`/matches/admin/result-cases/${caseId}`)).resultCase;
export const previewAdminDecision = async (matchId: string, body: { outcome: MatchOutcome; reason: string }) =>
  (await api<{ preview: AdminDecisionPreview }>(`/matches/${matchId}/admin-decision/preview`, { method: 'POST', body: JSON.stringify(body) })).preview;
export const decideAdminResult = (matchId: string, body: { outcome: MatchOutcome; reason: string; caseVersion: number; previewToken: string }) =>
  api(`/matches/${matchId}/admin-decision`, { method: 'POST', body: JSON.stringify({ ...body, confirm: true }) });
