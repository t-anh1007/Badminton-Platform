import type { MatchDiscipline, Passport, Prisma, SkillTier } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { awardStreakBadge, listBadges } from './badges.js';
import { findActiveSeason, SEASON_MIN_RESULTS } from './seasons.js';
import {
  HIGH_UNCERTAINTY_RD,
  TIER_CENTERS,
  coldStart,
  describeRating,
  redeclarationRating,
  updateRating,
  type RatingResult,
} from './rating.js';

const DISCIPLINES = ['singles', 'doubles'] as const;

/** BR-CM-52: tự khai một lần cho mỗi loại hình; sửa khai báo đi qua support ticket (Task 16). */
export async function declareTier(userId: string, discipline: MatchDiscipline, tier: SkillTier, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    // Khóa theo user để hai request đồng thời không cùng tạo Passport.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
    if (await tx.passport.findUnique({ where: { userId_discipline: { userId, discipline } } })) {
      throw new AppError(409, 'LEVEL_ALREADY_DECLARED', 'Bạn đã khai trình độ cho loại hình này. Muốn sửa hãy gửi yêu cầu hỗ trợ.');
    }
    const initial = coldStart(tier);
    return tx.passport.create({
      data: {
        userId, discipline, declaredTier: tier, ratingMu: initial.rating, ratingRd: initial.rd,
        ratingSigma: initial.sigma, declaredAt: now,
      },
    });
  });
}

export async function applyRatingPeriodInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  discipline: MatchDiscipline,
  results: RatingResult[],
  completedMatches = 1,
) {
  if (completedMatches < 0 || !Number.isInteger(completedMatches)) {
    throw new Error('completedMatches must be a non-negative integer.');
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
  const where = { userId_discipline: { userId, discipline } };
  const current = await tx.passport.findUnique({ where });
  if (!current) throw new AppError(404, 'PASSPORT_NOT_FOUND', 'Hồ sơ trình độ chưa tồn tại.');
  const next = updateRating(
    {
      rating: current.ratingMu,
      rd: current.ratingRd,
      sigma: current.ratingSigma,
    },
    results,
  );
  return tx.passport.update({
    where,
    data: {
      ratingMu: next.rating,
      ratingRd: next.rd,
      ratingSigma: next.sigma,
      matchesPlayed: { increment: completedMatches },
    },
  });
}

type RatedInput = { matchId: string; userId: string; discipline: MatchDiscipline; results: RatingResult[] };

/**
 * BR-CM-43..48: event chỉ là tín hiệu. Dưới khóa user, áp mọi suất rating đã giữ mà chưa ghi của người
 * này theo thứ tự finalizedAt có thẩm quyền, nên event đến lệch thứ tự RabbitMQ vẫn cho cùng rating và
 * chuỗi thắng. Replay (kể cả message id khác) là no-op nhờ MatchRatingChange unique.
 */
export async function applyRatedResultInTransaction(tx: Prisma.TransactionClient, input: RatedInput, now = new Date()) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`;
  const encounter = await tx.ratedEncounter.findUnique({ where: { matchId_userId: { matchId: input.matchId, userId: input.userId } } });
  if (!encounter) {
    // Event cũ không qua giữ suất (trước Task 18): áp trực tiếp như trước.
    await applyOneRatedResult(tx, input, now);
    return;
  }
  if (!encounter.rated) return;
  const pending = await tx.ratedEncounter.findMany({
    where: { userId: input.userId, discipline: input.discipline, rated: true },
    orderBy: [{ finalizedAt: 'asc' }, { matchId: 'asc' }],
  });
  const done = new Set((await tx.matchRatingChange.findMany({
    where: { userId: input.userId, discipline: input.discipline, matchId: { in: pending.map((row) => row.matchId) } },
    select: { matchId: true },
  })).map((row) => row.matchId));
  for (const row of pending) {
    if (done.has(row.matchId)) continue;
    const results = row.opponentRating !== null && row.opponentRd !== null && row.score !== null
      ? [{ opponentRating: row.opponentRating, opponentRd: row.opponentRd, score: row.score }]
      : row.matchId === input.matchId ? input.results : null;
    if (!results) continue;
    await applyOneRatedResult(tx, { matchId: row.matchId, userId: input.userId, discipline: input.discipline, results }, now);
  }
}

async function applyOneRatedResult(tx: Prisma.TransactionClient, input: RatedInput, now: Date) {
  const changeKey = { matchId_userId_discipline: { matchId: input.matchId, userId: input.userId, discipline: input.discipline } };
  if (await tx.matchRatingChange.findUnique({ where: changeKey })) return;
  const where = { userId_discipline: { userId: input.userId, discipline: input.discipline } };
  const before = await tx.passport.findUnique({ where });
  if (!before) throw new AppError(404, 'PASSPORT_NOT_FOUND', 'Hồ sơ trình độ chưa tồn tại.');
  const after = await applyRatingPeriodInTransaction(tx, input.userId, input.discipline, input.results, 1);
  await tx.passport.update({ where, data: { lastAgedAt: now } });
  const delta = after.ratingMu - before.ratingMu;
  const win = input.results.some((result) => result.score === 1);
  await tx.matchRatingChange.create({
    data: { ...changeKey.matchId_userId_discipline, ratingBefore: before.ratingMu, ratingAfter: after.ratingMu, delta, won: win },
  });

  // Số liệu kỳ theo kỳ chứa giờ kết thúc trận (BR-CM-56/57); kèo không có snapshot giờ chơi thì bỏ qua.
  const match = await tx.match.findUnique({ where: { id: input.matchId }, select: { endAt: true, provinceCode: true } });
  if (!match?.endAt) return;
  const season = await tx.season.findFirst({ where: { startAt: { lte: match.endAt }, endAt: { gt: match.endAt } } });
  if (!season) return;
  const profile = await tx.playerSeasonProfile.findUnique({ where: { seasonId_userId: { seasonId: season.id, userId: input.userId } } });
  const statKey = { seasonId_userId_discipline: { seasonId: season.id, userId: input.userId, discipline: input.discipline } };
  const stat = await tx.seasonStat.findUnique({ where: statKey });
  const currentWinStreak = win ? (stat?.currentWinStreak ?? 0) + 1 : 0;
  const counters = {
    matchesPlayed: (stat?.matchesPlayed ?? 0) + 1,
    wins: (stat?.wins ?? 0) + (win ? 1 : 0),
    provinceMatches: (stat?.provinceMatches ?? 0) + (profile && profile.provinceCode === match.provinceCode ? 1 : 0),
    currentWinStreak,
    longestWinStreak: Math.max(stat?.longestWinStreak ?? 0, currentWinStreak),
    ratingGain: (stat?.ratingGain ?? 0) + delta,
  };
  await tx.seasonStat.upsert({ where: statKey, create: { ...statKey.seasonId_userId_discipline, ...counters }, update: counters });
  await awardStreakBadge(tx, { userId: input.userId, discipline: input.discipline, seasonId: season.id, winStreak: currentWinStreak });
}

/**
 * BR-CM-49: mỗi rating period 7 ngày không hoạt động tăng RD theo Glicko-2 (updateRating với 0 trận),
 * trần 350. lastAgedAt tiến theo số kỳ đã áp nên chạy lại cùng thời điểm là no-op.
 */
export async function sweepRatingAging(now = new Date(), userIds?: string[]) {
  const periodMs = 7 * 24 * 60 * 60 * 1000;
  const scope = userIds ? { userId: { in: userIds } } : {};
  // Passport chưa có mốc: đặt mốc hôm nay, không tăng RD hồi tố.
  await prisma.passport.updateMany({ where: { ...scope, lastAgedAt: null }, data: { lastAgedAt: now } });
  const due = await prisma.passport.findMany({
    where: { ...scope, lastAgedAt: { lte: new Date(now.getTime() - periodMs) } },
    select: { userId: true, discipline: true },
    take: 200,
  });
  for (const key of due) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key.userId}, 0))`;
      const where = { userId_discipline: key };
      const passport = await tx.passport.findUniqueOrThrow({ where });
      const periods = Math.floor((now.getTime() - passport.lastAgedAt!.getTime()) / periodMs);
      if (periods < 1) return;
      let state = { rating: passport.ratingMu, rd: passport.ratingRd, sigma: passport.ratingSigma };
      for (let index = 0; index < periods; index += 1) state = updateRating(state, []);
      await tx.passport.update({
        where,
        data: { ratingRd: state.rd, lastAgedAt: new Date(passport.lastAgedAt!.getTime() + periods * periodMs) },
      });
    });
  }
  return due.length;
}

/**
 * BR-CM-54: áp quyết định sửa khai báo đã được Admin duyệt, đúng một lần cho mỗi ticket.
 * Chưa có trận: đặt về tâm bậc mới. Đã có trận: dịch tối đa ±50 theo D26, giữ RD/sigma.
 */
export async function applyRatingCorrection(input: {
  ticketId: string; userId: string; discipline: MatchDiscipline; approvedTier: SkillTier; adminUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`;
    if (await tx.passportCorrection.findUnique({ where: { ticketId: input.ticketId } })) return;
    const where = { userId_discipline: { userId: input.userId, discipline: input.discipline } };
    const current = await tx.passport.findUnique({ where });
    const next = !current || current.matchesPlayed === 0
      ? coldStart(input.approvedTier)
      : redeclarationRating({ rating: current.ratingMu, rd: current.ratingRd, sigma: current.ratingSigma }, input.approvedTier);
    await tx.passport.upsert({
      where,
      create: {
        userId: input.userId, discipline: input.discipline, declaredTier: input.approvedTier,
        ratingMu: next.rating, ratingRd: next.rd, ratingSigma: next.sigma, declaredAt: new Date(),
      },
      update: { declaredTier: input.approvedTier, ratingMu: next.rating, ratingRd: next.rd, ratingSigma: next.sigma },
    });
    await tx.passportCorrection.create({
      data: {
        ticketId: input.ticketId, userId: input.userId, discipline: input.discipline, adminUserId: input.adminUserId,
        approvedTier: input.approvedTier, previousRating: current?.ratingMu ?? null, newRating: next.rating,
        matchesPlayed: current?.matchesPlayed ?? 0,
      },
    });
  });
}

/** Trường nghiệp vụ cho màn 06; không lộ sigma hay công thức. */
function ownDisciplineView(passport: Passport, seasonResults: number) {
  const described = describeRating({ rating: passport.ratingMu, rd: passport.ratingRd, sigma: passport.ratingSigma });
  const highUncertainty = passport.ratingRd >= HIGH_UNCERTAINTY_RD;
  return {
    declaredTier: passport.declaredTier,
    declaredAt: passport.declaredAt,
    tier: described.tier,
    rating: Math.round(passport.ratingMu),
    matchesPlayed: passport.matchesPlayed,
    ratingStability: highUncertainty ? 'high_uncertainty' as const : 'established' as const,
    // Cùng điều kiện với BXH kỳ đang diễn ra: >= 5 kết quả trong kỳ và RD < 200 (BR-CM-57).
    leaderboardVisible: !highUncertainty && seasonResults >= SEASON_MIN_RESULTS,
    updatedAt: passport.updatedAt,
  };
}

async function findRecentCompletedMatches(userId: string) {
  const matches = await prisma.match.findMany({
    where: {
      status: 'completed',
      OR: [{ organizerUserId: userId }, { joins: { some: { participantUserId: userId, status: 'confirmed' } } }],
    },
    orderBy: { completedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      businessCode: true,
      bookingId: true,
      completedAt: true,
      organizerUserId: true,
      joins: {
        where: { status: 'confirmed' },
        select: { participantUserId: true },
      },
      evaluations: {
        where: { raterUserId: userId },
        select: { rateeUserId: true },
      },
    },
  });
  return matches.map((match) => {
    const submittedRatees = new Set(match.evaluations.map((evaluation) => evaluation.rateeUserId));
    const peerUserIds = new Set([match.organizerUserId, ...match.joins.map((join) => join.participantUserId)]);
    peerUserIds.delete(userId);
    return {
      id: match.id,
      businessCode: match.businessCode,
      bookingId: match.bookingId,
      completedAt: match.completedAt,
      evaluationCandidates: [...peerUserIds].map((peerUserId) => ({
        userId: peerUserId,
        submitted: submittedRatees.has(peerUserId),
      })),
    };
  });
}

export async function getOwnPassport(userId: string, now = new Date()) {
  const season = await findActiveSeason(prisma, now);
  const seasonStats = season
    ? await prisma.seasonStat.findMany({ where: { seasonId: season.id, userId }, select: { discipline: true, matchesPlayed: true } })
    : [];
  const [passports, countedEvaluations, flaggedEvaluationCount] = await Promise.all([
    prisma.passport.findMany({ where: { userId } }),
    prisma.evaluation.findMany({
      where: {
        rateeUserId: userId,
        countedAt: { not: null },
        flagged: false,
        perceivedTier: { not: null },
      },
      select: { perceivedTier: true },
    }),
    prisma.evaluation.count({
      where: { rateeUserId: userId, flagged: true, reviewStatus: 'pending' },
    }),
  ]);
  const byDiscipline = new Map(passports.map((passport) => [passport.discipline, passport]));
  const evaluationScore =
    countedEvaluations.length === 0
      ? null
      : countedEvaluations.reduce((total, evaluation) => total + TIER_CENTERS[evaluation.perceivedTier!], 0) /
        countedEvaluations.length;
  return {
    userId,
    ...Object.fromEntries(DISCIPLINES.map((discipline) => {
      const passport = byDiscipline.get(discipline);
      const seasonResults = seasonStats.find((stat) => stat.discipline === discipline)?.matchesPlayed ?? 0;
      return [discipline, passport ? ownDisciplineView(passport, seasonResults) : null];
    })) as Record<MatchDiscipline, ReturnType<typeof ownDisciplineView> | null>,
    canDeclare: Object.fromEntries(DISCIPLINES.map((discipline) => [discipline, !byDiscipline.has(discipline)])) as Record<MatchDiscipline, boolean>,
    evaluationScore,
    evaluationCount: countedEvaluations.length,
    flaggedEvaluationCount,
    recentMatches: await findRecentCompletedMatches(userId),
    badges: await listBadges(userId),
  };
}

/** Public: chỉ bậc và số trận mỗi loại hình; rating/RD chỉ lộ qua BXH/kết quả theo chính sách công khai. */
export async function getPublicPassport(userId: string) {
  const passports = await prisma.passport.findMany({ where: { userId } });
  if (passports.length === 0) throw new AppError(404, 'PASSPORT_NOT_FOUND', 'Hồ sơ trình độ chưa tồn tại.');
  const byDiscipline = new Map(passports.map((passport) => [passport.discipline, passport]));
  return {
    userId,
    ...Object.fromEntries(DISCIPLINES.map((discipline) => {
      const passport = byDiscipline.get(discipline);
      return [discipline, passport ? {
        tier: describeRating({ rating: passport.ratingMu, rd: passport.ratingRd, sigma: passport.ratingSigma }).tier,
        matchesPlayed: passport.matchesPlayed,
      } : null];
    })) as Record<MatchDiscipline, { tier: SkillTier; matchesPlayed: number } | null>,
    badges: await listBadges(userId),
  };
}
