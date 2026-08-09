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
}
export interface OwnJoin {
  id: string;
  status: JoinStatus;
  approvedAt: string | null;
}
export interface MatchDetail extends Omit<MatchRow, 'organizerUserId'> {
  status: 'open' | 'filled' | 'confirmed';
  organizer: {
    displayName: string;
    identityVisibility: string;
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

export function listMatches(filters: { area?: string; skill?: SkillTier; startFrom?: string } = {}) {
  const query = new URLSearchParams();
  if (filters.area) query.set('area', filters.area);
  if (filters.skill) query.set('skill', filters.skill);
  if (filters.startFrom) query.set('startFrom', filters.startFrom);
  return api<{ matches: MatchRow[] }>(`/matches${query.size ? `?${query}` : ''}`);
}
export const getMatchDetail = (id: string) => api<MatchDetail>(`/matches/${id}`);
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
export const createMatch = (body: {
  bookingId: string;
  capacity: number;
  feeMode: 'free' | 'split';
  skillMin?: SkillTier;
  skillMax?: SkillTier;
}) => api<MatchRow>('/matches', { method: 'POST', body: JSON.stringify(body) });
