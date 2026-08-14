import type { SkillTier } from './matchApi';

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
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể tải Player Passport.');
  return body;
}

export interface PublicPassport {
  userId: string;
  tier: SkillTier;
  matchesPlayed: number;
}
export interface OwnPassport extends PublicPassport {
  declaredTier: SkillTier | null;
  rating: number;
  rd: number;
  sigma: number;
  uncertainty: 'high' | 'established';
  evaluationScore: number | null;
  evaluationCount: number;
  flaggedEvaluationCount: number;
  recentMatches: Array<{
    id: string;
    bookingId: string;
    completedAt: string;
    evaluationCandidates: Array<{ userId: string; submitted: boolean }>;
  }>;
  updatedAt: string;
  nextDeclarationAt: string | null;
  canDeclareTier: boolean;
}
export const getOwnPassport = () => api<OwnPassport>('/passports/me');
export const getPublicPassport = (userId: string) => api<PublicPassport>(`/passports/${userId}`);
export const declarePassportTier = (tier: SkillTier) =>
  api<OwnPassport>('/passports/me/declaration', {
    method: 'PUT',
    body: JSON.stringify({ tier }),
  });
export const submitMatchEvaluation = (matchId: string, rateeUserId: string, perceivedTier: SkillTier) =>
  api(`/matches/${matchId}/evaluations`, {
    method: 'POST',
    body: JSON.stringify({ rateeUserId, perceivedTier }),
  });
