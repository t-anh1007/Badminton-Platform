import type { SkillTier } from './matchApi';
import { publishDataInvalidation } from '../realtime/dataInvalidation.js';

const BASE_URL = import.meta.env.VITE_MATCHMAKING_URL ?? '/api/matchmaking';
function token(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('accessToken');
}
/** Gọi matchmaking-service; dùng chung cho passport, BXH và chương trình thưởng. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
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
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể tải hồ sơ trình độ.');
  if (init?.method && init.method !== 'GET') publishDataInvalidation();
  return body;
}

export type Discipline = 'singles' | 'doubles';

export interface PlayerBadge {
  label: string;
  disciplineLabel: string;
  seasonName: string;
  provinceName: string | null;
  awardedAt: string;
}
export interface PublicPassport {
  userId: string;
  singles: { tier: SkillTier; matchesPlayed: number } | null;
  doubles: { tier: SkillTier; matchesPlayed: number } | null;
  badges: PlayerBadge[];
  displayName?: string;
  avatarUrl?: string | null;
  identityVisibility?: 'public' | 'hidden';
}
export interface OwnDisciplinePassport {
  declaredTier: SkillTier;
  declaredAt: string;
  tier: SkillTier;
  rating: number;
  matchesPlayed: number;
  ratingStability: 'high_uncertainty' | 'established';
  leaderboardVisible: boolean;
  leaderboardBand: 'under_1600' | 'from_1600';
  season: { matchesPlayed: number; wins: number; currentWinStreak: number };
  updatedAt: string;
}
export interface OwnPassport {
  userId: string;
  singles: OwnDisciplinePassport | null;
  doubles: OwnDisciplinePassport | null;
  canDeclare: Record<Discipline, boolean>;
  evaluationScore: number | null;
  evaluationCount: number;
  flaggedEvaluationCount: number;
  recentMatches: Array<{
    id: string;
    businessCode?: string;
    bookingId: string;
    completedAt: string;
    evaluationCandidates: Array<{ userId: string; submitted: boolean }>;
  }>;
  badges: PlayerBadge[];
}
export interface MatchHistoryItem {
  matchId: string;
  businessCode: string;
  endedAt: string;
  discipline: Discipline;
  mode: 'friendly' | 'ranked';
  outcome: 'win' | 'loss';
  scoreLabel: string;
  ratingDelta: number | null;
  opponents: Array<{ userId: string; displayName: string; avatarUrl: string | null }>;
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export const getOwnPassport = () => api<OwnPassport>('/passports/me');
export const getPublicPassport = (userId: string) => api<PublicPassport>(`/passports/${userId}`);
export const declarePassportTier = (discipline: Discipline, tier: SkillTier) =>
  api<OwnPassport>('/passports/me/declaration', {
    method: 'PUT',
    body: JSON.stringify({ discipline, tier }),
  });
export const getMatchHistory = (discipline: Discipline, page = 1, pageSize = 5) =>
  api<Page<MatchHistoryItem>>(`/passports/me/matches?${new URLSearchParams({ discipline, page: String(page), pageSize: String(pageSize) })}`);
export const submitMatchEvaluation = (matchId: string, rateeUserId: string, perceivedTier: SkillTier) =>
  api(`/matches/${matchId}/evaluations`, {
    method: 'POST',
    body: JSON.stringify({ rateeUserId, perceivedTier }),
  });
