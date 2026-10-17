import { api, type Discipline } from './passportApi';

/** Hạng đấu của mùa, khóa ở trận xếp hạng đầu tiên: amateur = Không chuyên, pro = Chuyên. */
export type LeaderboardBand = 'amateur' | 'pro';
export const DIVISION_LABEL: Record<LeaderboardBand, string> = { amateur: 'Không chuyên', pro: 'Chuyên' };
export const DIVISION_TIERS: Record<LeaderboardBand, string> = { amateur: 'Yếu, Trung bình', pro: 'Trung bình khá, Bán chuyên' };
export type LeaderboardScope = 'global' | 'province';

export interface CurrentSeason {
  season: { id: string; name: string; startAt: string; endAt: string; status: string } | null;
  myRegion: string | null;
}
export interface LeaderboardRow {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  provinceCode: string | null;
  /** Điểm BXH mùa (Elo), tách khỏi điểm kinh nghiệm. */
  points: number;
  matchesPlayed: number;
  wins: number;
}
export interface Leaderboard {
  items: LeaderboardRow[];
  viewer: LeaderboardRow | null;
  total: number;
  page: number;
  pageSize: number;
  serverNow: string;
}
export interface LeaderboardQuery {
  seasonId?: string;
  discipline: Discipline;
  scope: LeaderboardScope;
  provinceCode?: string;
  band: LeaderboardBand;
  page?: number;
  pageSize?: number;
}

export const getCurrentSeason = () => api<CurrentSeason>('/competition/seasons/current');
export const selectSeasonRegion = (provinceCode: string) =>
  api<{ seasonId: string; provinceCode: string; lockedAt: string }>('/competition/seasons/current/me/region', {
    method: 'PUT',
    body: JSON.stringify({ provinceCode }),
  });
export function getLeaderboard(query: LeaderboardQuery) {
  const params = new URLSearchParams({
    discipline: query.discipline, scope: query.scope, band: query.band,
    page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 20),
  });
  if (query.scope === 'province' && query.provinceCode) params.set('provinceCode', query.provinceCode);
  if (query.seasonId) params.set('seasonId', query.seasonId);
  return api<Leaderboard>(`/competition/leaderboards?${params}`);
}

export interface AdminSeason { id: string; name: string; startAt: string; endAt: string; status: 'scheduled' | 'active' | 'closing' | 'closed'; eligiblePlayerCount: number }
export const listAdminSeasons = (page = 1, pageSize = 10) =>
  api<{ items: AdminSeason[]; total: number; page: number; pageSize: number }>(`/competition/admin/seasons?${new URLSearchParams({ page: String(page), pageSize: String(pageSize) })}`);
export const createSeason = (body: { name: string; startAt: string; endAt: string }) =>
  api<{ season: unknown }>('/competition/admin/seasons', { method: 'POST', body: JSON.stringify(body) });
export const updateSeason = (id: string, body: { name?: string; startAt?: string; endAt?: string }) =>
  api<{ season: unknown }>(`/competition/admin/seasons/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const closeSeason = (id: string) => api<{ season: unknown }>(`/competition/admin/seasons/${id}/close`, { method: 'POST', body: '{}' });
