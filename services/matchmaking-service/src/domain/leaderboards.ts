import { Prisma, type MatchDiscipline } from '@prisma/client';
import type { AccountClient } from '../clients/account.js';
import { prisma } from '../lib/prisma.js';
import { HIGH_UNCERTAINTY_RD } from './rating.js';
import { findActiveSeason, SEASON_MIN_RESULTS } from './seasons.js';

export interface LeaderboardQuery {
  seasonId?: string;
  discipline: MatchDiscipline;
  scope: 'global' | 'province';
  provinceCode?: string;
  band: 'under_1600' | 'from_1600';
  page: number;
  pageSize: number;
}

interface RankedRow { rank: bigint; userId: string; provinceCode: string | null; rating: number; matchesPlayed: number; wins: number }

/** Tên công khai theo D31: hồ sơ ẩn danh hiển thị nhãn trung tính. */
export async function identities(accountClient: AccountClient, userIds: string[]) {
  const profiles = userIds.length ? await accountClient.getPublicDisplayNames(userIds) : [];
  const byId = new Map(profiles.map((profile) => [profile.userId, profile]));
  return (userId: string) => ({
    displayName: byId.get(userId)?.displayName ?? 'Người chơi',
    avatarUrl: byId.get(userId)?.avatarUrl ?? null,
  });
}

/**
 * BR-CM-57..60: chỉ người đủ điều kiện (>= 5 kết quả trong kỳ, RD < 200; bảng tỉnh cần thêm 5 trận
 * thuộc tỉnh chính) theo nhóm rating hiện tại, nên vượt 1600 là chuyển bảng ngay. Đồng hạng khi
 * rating làm tròn bằng nhau. Đọc thẳng season_stats/passports, không cache.
 */
export type BoardKey = Pick<LeaderboardQuery, 'discipline' | 'scope' | 'provinceCode' | 'band'> & { seasonId: string };

/** CTE `ranked` của một bảng; dùng chung cho API BXH và trao huy hiệu khi đóng kỳ. */
export function rankedBoardSql(key: BoardKey) {
  const band = key.band === 'under_1600'
    ? Prisma.sql`COALESCE(s."finalRating", p."ratingMu") < 1600`
    : Prisma.sql`COALESCE(s."finalRating", p."ratingMu") >= 1600`;
  const scope = key.scope === 'province'
    ? Prisma.sql`AND r."provinceCode" = ${key.provinceCode} AND s."provinceMatches" >= ${SEASON_MIN_RESULTS}`
    : Prisma.empty;
  const seasonId = key.seasonId;
  const query = key;
  return Prisma.sql`
    WITH ranked AS (
      SELECT s."userId", r."provinceCode", ROUND(COALESCE(s."finalRating", p."ratingMu"))::int AS rating, s."matchesPlayed", s.wins,
             RANK() OVER (ORDER BY ROUND(COALESCE(s."finalRating", p."ratingMu")) DESC) AS rank
      FROM season_stats s
      JOIN passports p ON p."userId" = s."userId" AND p.discipline = s.discipline
      LEFT JOIN player_season_profiles r ON r."seasonId" = s."seasonId" AND r."userId" = s."userId"
      WHERE s."seasonId" = ${seasonId} AND s.discipline = ${query.discipline}::"MatchDiscipline"
        AND s."matchesPlayed" >= ${SEASON_MIN_RESULTS} AND COALESCE(s."finalRd", p."ratingRd") < ${HIGH_UNCERTAINTY_RD} AND ${band} ${scope}
    )`;
}

export async function getLeaderboard(accountClient: AccountClient, query: LeaderboardQuery, viewerUserId?: string, now = new Date()) {
  const seasonId = query.seasonId ?? (await findActiveSeason(prisma, now))?.id;
  const empty = { items: [], viewer: null, total: 0, page: query.page, pageSize: query.pageSize, serverNow: now.toISOString() };
  if (!seasonId || (query.scope === 'province' && !query.provinceCode)) return empty;
  const ranked = rankedBoardSql({ ...query, seasonId });
  const [rows, totals, viewerRows] = await Promise.all([
    prisma.$queryRaw<RankedRow[]>`${ranked} SELECT * FROM ranked ORDER BY rank, "userId" LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
    prisma.$queryRaw<Array<{ total: bigint }>>`${ranked} SELECT COUNT(*) AS total FROM ranked`,
    viewerUserId ? prisma.$queryRaw<RankedRow[]>`${ranked} SELECT * FROM ranked WHERE "userId" = ${viewerUserId}` : Promise.resolve([]),
  ]);
  const identity = await identities(accountClient, [...new Set([...rows, ...viewerRows].map((row) => row.userId))]);
  // Danh sách trường công khai (BR-CM-61): không có RD, sigma, tiền hay bằng chứng.
  const view = (row: RankedRow) => ({
    rank: Number(row.rank), userId: row.userId, ...identity(row.userId), provinceCode: row.provinceCode,
    rating: row.rating, matchesPlayed: row.matchesPlayed, wins: row.wins,
  });
  return {
    items: rows.map(view), viewer: viewerRows[0] ? view(viewerRows[0]) : null,
    total: Number(totals[0]?.total ?? 0), page: query.page, pageSize: query.pageSize, serverNow: now.toISOString(),
  };
}

/** Lịch sử trận có người thắng đã chốt của một loại hình; ratingDelta null khi trận không được tính rating. */
export async function getMatchHistory(
  accountClient: AccountClient, userId: string, input: { discipline: MatchDiscipline; page: number; pageSize: number },
) {
  const where: Prisma.MatchResultCaseWhereInput = {
    status: 'final', outcome: { in: ['TEAM_A_WIN', 'TEAM_B_WIN'] },
    match: {
      discipline: input.discipline,
      OR: [{ organizerUserId: userId }, { joins: { some: { participantUserId: userId, status: 'confirmed' } } }],
    },
  };
  const [cases, total] = await Promise.all([
    prisma.matchResultCase.findMany({
      where, orderBy: { finalizedAt: 'desc' }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
      include: {
        match: { include: { joins: { where: { status: 'confirmed' }, select: { participantUserId: true, teamSide: true } } } },
        claims: { orderBy: { createdAt: 'asc' }, include: { sets: { orderBy: { position: 'asc' } } } },
      },
    }),
    prisma.matchResultCase.count({ where }),
  ]);
  const changes = await prisma.matchRatingChange.findMany({
    where: { userId, discipline: input.discipline, matchId: { in: cases.map((row) => row.matchId) } },
  });
  const deltaByMatch = new Map(changes.map((change) => [change.matchId, change.delta]));
  const rows = cases.map((resultCase) => {
    const { match } = resultCase;
    const sideOf = (id: string) => (id === match.organizerUserId ? 'A' : match.joins.find((join) => join.participantUserId === id)?.teamSide ?? 'B');
    const mySide = sideOf(userId);
    const roster = [match.organizerUserId, ...match.joins.map((join) => join.participantUserId)];
    // Tỷ số hiển thị theo BR-CM-29: bản của chủ kèo cùng bên thắng, nếu không thì bản đầu tiên.
    const sameWinner = resultCase.claims.filter((claim) => claim.outcome === resultCase.outcome);
    const shown = sameWinner.find((claim) => claim.claimantUserId === match.organizerUserId) ?? sameWinner[0];
    return {
      matchId: match.id,
      businessCode: match.businessCode,
      endedAt: (match.endAt ?? resultCase.finalizedAt!).toISOString(),
      discipline: match.discipline,
      outcome: (resultCase.outcome === 'TEAM_A_WIN') === (mySide === 'A') ? 'win' as const : 'loss' as const,
      scoreLabel: shown
        ? shown.sets.map((set) => (mySide === 'A' ? `${set.teamA}-${set.teamB}` : `${set.teamB}-${set.teamA}`)).join(', ')
        : '',
      opponentIds: roster.filter((id) => sideOf(id) !== mySide),
      ratingDelta: deltaByMatch.has(match.id) ? Math.round(deltaByMatch.get(match.id)!) : null,
    };
  });
  const identity = await identities(accountClient, [...new Set(rows.flatMap((row) => row.opponentIds))]);
  return {
    items: rows.map(({ opponentIds, ...row }) => ({ ...row, opponents: opponentIds.map((id) => ({ userId: id, ...identity(id) })) })),
    total, page: input.page, pageSize: input.pageSize,
  };
}
