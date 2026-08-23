const BASE_URL = import.meta.env.VITE_MATCHMAKING_URL ?? '/api/matchmaking';

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
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể xử lý yêu cầu kèo.');
  return body;
}

export type SkillTier = 'newcomer' | 'beginner' | 'intermediate' | 'intermediate_plus' | 'advanced';
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
export interface MatchRow {
  id: string;
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
export interface MatchDetail extends Omit<MatchRow, 'organizerUserId'> {
  status: 'awaiting_deposit' | 'open' | 'filled' | 'confirmed';
  organizer: {
    displayName: string;
    avatarUrl: string | null;
    identityVisibility: 'public' | 'hidden';
    tier: SkillTier | null;
  };
  confirmedParticipants: number;
  actions: {
    canJoin: boolean;
    isOrganizer: boolean;
    canPayOrganizerContribution: boolean;
    ownJoin: OwnJoin | null;
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
export const requestMatchJoin = (id: string) =>
  api<OwnJoin & { matchId: string }>(`/matches/${id}/joins`, {
    method: 'POST',
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
export const createMatch = (body: ({ bookingId: string; holdId?: never } | { holdId: string; bookingId?: never }) & {
  capacity: number;
  feeMode: 'free' | 'split';
  skillMin?: SkillTier;
  skillMax?: SkillTier;
}) => api<MatchRow>('/matches', { method: 'POST', body: JSON.stringify(body) });
export async function getAdminEvaluations(reviewStatus: AdminEvaluationRow['reviewStatus'] = 'pending') {
  const result = await api<{ evaluations: AdminEvaluationRow[] }>(`/matches/admin/evaluations?reviewStatus=${reviewStatus}`);
  return result.evaluations;
}
export const reviewAdminEvaluation = (matchId: string, evaluationId: string, decision: 'approve' | 'reject') =>
  api(`/matches/${matchId}/evaluations/${evaluationId}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ decision }),
  });
