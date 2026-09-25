import type { MatchDiscipline, Prisma } from '@prisma/client';
import { VIETNAM_PROVINCES } from '@khoaluantn/shared';
import { prisma } from '../lib/prisma.js';
import { rankedBoardSql, type BoardKey } from './leaderboards.js';

const STREAK_STEP = 5;
const TOP_RANK = 10;
const provinceName = new Map<string, string>(VIETNAM_PROVINCES.map((province) => [province.code, province.name]));

/**
 * Huy hiệu chuỗi thắng: mỗi bội số 5 của chuỗi thắng trong kỳ (WIN_STREAK_5, _10, ...). Gọi trong transaction
 * áp kết quả đã được tính rating, nên friendly/NO_RESULT/trận vượt giới hạn không bao giờ tới đây.
 */
export async function awardStreakBadge(
  tx: Prisma.TransactionClient,
  input: { userId: string; discipline: MatchDiscipline; seasonId: string; winStreak: number },
) {
  if (input.winStreak === 0 || input.winStreak % STREAK_STEP !== 0) return;
  await tx.playerBadge.createMany({
    data: {
      userId: input.userId, discipline: input.discipline, seasonId: input.seasonId,
      badgeType: `WIN_STREAK_${input.winStreak}`, scope: 'global', provinceCode: '',
    },
    skipDuplicates: true,
  });
}

/** Khi đóng kỳ: Top 10 và Vua sân (hạng 1, đồng hạng cùng nhận) cho mọi bảng đơn/đôi × nhóm rating × phạm vi. */
export async function awardSeasonBadges(tx: Prisma.TransactionClient, seasonId: string) {
  const provinces = (await tx.playerSeasonProfile.findMany({
    where: { seasonId }, distinct: ['provinceCode'], select: { provinceCode: true },
  })).map((row) => row.provinceCode);
  const boards: BoardKey[] = [];
  for (const discipline of ['singles', 'doubles'] as const) {
    for (const band of ['under_1600', 'from_1600'] as const) {
      boards.push({ seasonId, discipline, band, scope: 'global' });
      for (const provinceCode of provinces) boards.push({ seasonId, discipline, band, scope: 'province', provinceCode });
    }
  }
  for (const board of boards) {
    const rows = await tx.$queryRaw<Array<{ userId: string; rank: bigint }>>`
      ${rankedBoardSql(board)} SELECT "userId", rank FROM ranked WHERE rank <= ${TOP_RANK}`;
    const location = { seasonId, discipline: board.discipline, scope: board.scope, provinceCode: board.provinceCode ?? '' };
    await tx.playerBadge.createMany({
      data: rows.flatMap((row) => [
        { ...location, userId: row.userId, badgeType: 'TOP_10' },
        ...(Number(row.rank) === 1 ? [{ ...location, userId: row.userId, badgeType: 'KING_OF_COURT' }] : []),
      ]),
      skipDuplicates: true,
    });
  }
}

function badgeLabel(badgeType: string) {
  const streak = /^WIN_STREAK_(\d+)$/.exec(badgeType);
  if (streak) return `Chuỗi ${streak[1]} trận thắng`;
  return badgeType === 'KING_OF_COURT' ? 'Vua sân' : 'Top 10';
}

/** Huy hiệu vĩnh viễn với nhãn nghiệp vụ; không trả mã enum thô. */
export async function listBadges(userId: string) {
  const badges = await prisma.playerBadge.findMany({
    where: { userId }, orderBy: { awardedAt: 'desc' }, include: { season: { select: { name: true } } },
  });
  return badges.map((badge) => ({
    label: badgeLabel(badge.badgeType),
    disciplineLabel: badge.discipline === 'doubles' ? 'Đôi' : 'Đơn',
    seasonName: badge.season.name,
    provinceName: badge.provinceCode ? provinceName.get(badge.provinceCode) ?? null : null,
    awardedAt: badge.awardedAt.toISOString(),
  }));
}
