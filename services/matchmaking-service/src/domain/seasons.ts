import type { Prisma, Season } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { HIGH_UNCERTAINTY_RD } from './rating.js';
import { awardSeasonBadges } from './badges.js';
import { countPendingRatedWork } from './ratedResults.js';

type Db = Prisma.TransactionClient | typeof prisma;
export type SeasonStatus = 'scheduled' | 'active' | 'closing' | 'closed';
/** BR-CM-57: tối thiểu 5 ranked result hợp lệ trong kỳ (cùng RD < 200). */
export const SEASON_MIN_RESULTS = 5;
const SEASON_LOCK = 'competition:seasons';

/** Trạng thái nghiệp vụ suy ra từ thời gian; closing = đã hết giờ, chờ đối soát kết quả rồi Admin đóng. */
export function seasonStatus(season: Pick<Season, 'startAt' | 'endAt' | 'closedAt'>, now: Date): SeasonStatus {
  if (season.closedAt) return 'closed';
  if (now < season.startAt) return 'scheduled';
  return now < season.endAt ? 'active' : 'closing';
}

export function findActiveSeason(db: Db, now = new Date()) {
  return db.season.findFirst({ where: { closedAt: null, startAt: { lte: now }, endAt: { gt: now } } });
}

/** BR-CM-55: một lịch kỳ toàn nền tảng, hai kỳ không chồng nhau (liền kề đúng mốc vẫn hợp lệ). */
async function assertNoOverlap(tx: Prisma.TransactionClient, startAt: Date, endAt: Date, excludeId?: string) {
  if (endAt <= startAt) throw new AppError(400, 'SEASON_RANGE_INVALID', 'Thời điểm kết thúc phải sau thời điểm bắt đầu.');
  const overlapping = await tx.season.findFirst({
    where: { id: excludeId ? { not: excludeId } : undefined, startAt: { lt: endAt }, endAt: { gt: startAt } },
  });
  if (overlapping) throw new AppError(409, 'SEASON_OVERLAP', 'Kỳ thi đấu bị chồng thời gian với một kỳ khác.');
}

export async function createSeason(input: { name: string; startAt: Date; endAt: Date }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${SEASON_LOCK}, 0))`;
    await assertNoOverlap(tx, input.startAt, input.endAt);
    return tx.season.create({ data: input });
  });
}

export async function updateSeason(id: string, input: { name?: string; startAt?: Date; endAt?: Date }, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${SEASON_LOCK}, 0))`;
    const season = await tx.season.findUnique({ where: { id } });
    if (!season) throw new AppError(404, 'SEASON_NOT_FOUND', 'Không tìm thấy kỳ thi đấu.');
    if (season.closedAt) throw new AppError(409, 'SEASON_CLOSED', 'Kỳ thi đấu đã đóng.');
    if (input.startAt && input.startAt.getTime() !== season.startAt.getTime() && season.startAt <= now) {
      throw new AppError(409, 'SEASON_STARTED', 'Kỳ đã bắt đầu nên không đổi được thời điểm bắt đầu.');
    }
    const startAt = input.startAt ?? season.startAt;
    const endAt = input.endAt ?? season.endAt;
    await assertNoOverlap(tx, startAt, endAt, id);
    return tx.season.update({ where: { id }, data: { name: input.name, startAt, endAt } });
  });
}

export async function closeSeason(id: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${SEASON_LOCK}, 0))`;
    const season = await tx.season.findUnique({ where: { id } });
    if (!season) throw new AppError(404, 'SEASON_NOT_FOUND', 'Không tìm thấy kỳ thi đấu.');
    if (season.closedAt) return season;
    if (now < season.endAt) throw new AppError(409, 'SEASON_NOT_ENDED', 'Kỳ thi đấu chưa kết thúc.');
    if (await countPendingRatedWork(tx, { from: season.startAt, to: new Date(season.endAt.getTime() - 1) }) > 0) {
      throw new AppError(409, 'SEASON_RESULTS_PENDING', 'Còn kết quả hoặc điểm xếp hạng của kỳ chưa hoàn tất.');
    }
    // Khóa BXH cuối kỳ: chụp rating/RD rồi trao Top 10 / Vua sân từ bản chụp đó.
    await tx.$executeRaw`
      UPDATE season_stats s SET "finalRating" = p."ratingMu", "finalRd" = p."ratingRd"
      FROM passports p WHERE p."userId" = s."userId" AND p.discipline = s.discipline AND s."seasonId" = ${id}`;
    await awardSeasonBadges(tx, id);
    return tx.season.update({ where: { id }, data: { closedAt: now } });
  });
}

/** Người đủ điều kiện ở ít nhất một loại hình: ≥ 5 kết quả trong kỳ và RD < 200 (BR-CM-57). */
async function eligiblePlayerCount(seasonId: string) {
  const stats = await prisma.seasonStat.findMany({
    where: { seasonId, matchesPlayed: { gte: SEASON_MIN_RESULTS } },
    select: { userId: true, discipline: true },
  });
  if (stats.length === 0) return 0;
  const passports = await prisma.passport.findMany({
    where: { OR: stats.map((stat) => ({ userId: stat.userId, discipline: stat.discipline })), ratingRd: { lt: HIGH_UNCERTAINTY_RD } },
    select: { userId: true },
  });
  return new Set(passports.map((passport) => passport.userId)).size;
}

export async function listSeasons(input: { page: number; pageSize: number }, now = new Date()) {
  const [rows, total] = await Promise.all([
    prisma.season.findMany({ orderBy: { startAt: 'desc' }, skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.season.count(),
  ]);
  return {
    items: await Promise.all(rows.map(async (season) => ({
      id: season.id, name: season.name, startAt: season.startAt.toISOString(), endAt: season.endAt.toISOString(),
      status: seasonStatus(season, now), eligiblePlayerCount: await eligiblePlayerCount(season.id),
    }))),
    total, page: input.page, pageSize: input.pageSize,
  };
}

export async function getCurrentSeason(userId: string | undefined, now = new Date()) {
  const season = await findActiveSeason(prisma, now);
  const profile = season && userId
    ? await prisma.playerSeasonProfile.findUnique({ where: { seasonId_userId: { seasonId: season.id, userId } } })
    : null;
  return {
    season: season && {
      id: season.id, name: season.name, startAt: season.startAt.toISOString(), endAt: season.endAt.toISOString(),
      status: seasonStatus(season, now),
    },
    myRegion: profile?.provinceCode ?? null,
  };
}

/** BR-CM-59: chọn tỉnh/thành chính đúng một lần mỗi kỳ; khóa tới hết kỳ. */
export async function selectSeasonRegion(userId: string, provinceCode: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
    const season = await findActiveSeason(tx, now);
    if (!season) throw new AppError(409, 'NO_ACTIVE_SEASON', 'Chưa có kỳ thi đấu đang diễn ra.');
    const where = { seasonId_userId: { seasonId: season.id, userId } };
    if (await tx.playerSeasonProfile.findUnique({ where })) {
      throw new AppError(409, 'SEASON_REGION_LOCKED', 'Bạn đã chọn khu vực cho kỳ này; có thể đổi ở kỳ sau.');
    }
    return tx.playerSeasonProfile.create({ data: { seasonId: season.id, userId, provinceCode, lockedAt: now } });
  });
}

/** Kèo xếp hạng cần khu vực của kỳ đang diễn ra; không có kỳ thì chưa áp yêu cầu, kèo giao hữu không bị chặn. */
export async function assertRankedSeasonRegion(db: Db, userId: string, now = new Date()) {
  const season = await findActiveSeason(db, now);
  if (!season) return;
  const profile = await db.playerSeasonProfile.findUnique({ where: { seasonId_userId: { seasonId: season.id, userId } } });
  if (!profile) {
    throw new AppError(409, 'SEASON_REGION_REQUIRED', 'Hãy chọn tỉnh/thành chính của kỳ trước khi chơi kèo xếp hạng.');
  }
}
