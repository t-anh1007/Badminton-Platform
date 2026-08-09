import type { Prisma, SkillTier } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import {
  REDECLARATION_DAYS,
  TIER_CENTERS,
  coldStart,
  describeRating,
  redeclarationRating,
  updateRating,
  type RatingResult,
} from './rating.js';

const REDECLARATION_MS = REDECLARATION_DAYS * 24 * 60 * 60 * 1000;

export async function declareTier(userId: string, tier: SkillTier, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    // Covers both existing and first declaration, so concurrent requests cannot
    // bypass cooldown or race the one-row-per-user Passport invariant.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
    const existing = await tx.passport.findUnique({ where: { userId } });
    if (!existing) {
      const initial = coldStart(tier);
      return tx.passport.create({
        data: {
          userId,
          declaredTier: tier,
          ratingMu: initial.rating,
          ratingRd: initial.rd,
          ratingSigma: initial.sigma,
          declaredAt: now,
        },
      });
    }

    if (existing.declaredAt) {
      const nextAllowedAt = new Date(existing.declaredAt.getTime() + REDECLARATION_MS);
      if (now < nextAllowedAt) {
        throw new AppError(409, 'TIER_REDECLARATION_COOLDOWN', 'Chỉ được khai lại bậc mỗi 30 ngày.', {
          nextAllowedAt: nextAllowedAt.toISOString(),
        });
      }
    }

    const current = {
      rating: existing.ratingMu,
      rd: existing.ratingRd,
      sigma: existing.ratingSigma,
    };
    const next = existing.matchesPlayed === 0 ? coldStart(tier) : redeclarationRating(current, tier);
    return tx.passport.update({
      where: { userId },
      data: {
        declaredTier: tier,
        ratingMu: next.rating,
        ratingRd: next.rd,
        ratingSigma: next.sigma,
        declaredAt: now,
      },
    });
  });
}

export async function applyRatingPeriodInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  results: RatingResult[],
  completedMatches = 1,
) {
  if (completedMatches < 0 || !Number.isInteger(completedMatches)) {
    throw new Error('completedMatches must be a non-negative integer.');
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
  const current = await tx.passport.findUnique({ where: { userId } });
  if (!current) throw new AppError(404, 'PASSPORT_NOT_FOUND', 'Player Passport chưa tồn tại.');
  const next = updateRating(
    {
      rating: current.ratingMu,
      rd: current.ratingRd,
      sigma: current.ratingSigma,
    },
    results,
  );
  return tx.passport.update({
    where: { userId },
    data: {
      ratingMu: next.rating,
      ratingRd: next.rd,
      ratingSigma: next.sigma,
      matchesPlayed: { increment: completedMatches },
    },
  });
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
      bookingId: match.bookingId,
      completedAt: match.completedAt,
      evaluationCandidates: [...peerUserIds].map((peerUserId) => ({
        userId: peerUserId,
        submitted: submittedRatees.has(peerUserId),
      })),
    };
  });
}

export async function getOwnPassport(userId: string) {
  const [passport, countedEvaluations, flaggedEvaluationCount] = await Promise.all([
    prisma.passport.findUnique({ where: { userId } }),
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
  if (!passport) throw new AppError(404, 'PASSPORT_NOT_FOUND', 'Player Passport chưa tồn tại.');
  const evaluationScore =
    countedEvaluations.length === 0
      ? null
      : countedEvaluations.reduce((total, evaluation) => total + TIER_CENTERS[evaluation.perceivedTier!], 0) /
        countedEvaluations.length;
  return {
    userId,
    declaredTier: passport.declaredTier,
    ...describeRating({
      rating: passport.ratingMu,
      rd: passport.ratingRd,
      sigma: passport.ratingSigma,
    }),
    matchesPlayed: passport.matchesPlayed,
    evaluationScore,
    evaluationCount: countedEvaluations.length,
    flaggedEvaluationCount,
    recentMatches: await findRecentCompletedMatches(userId),
    updatedAt: passport.updatedAt,
  };
}

export async function getPublicPassport(userId: string) {
  const passport = await prisma.passport.findUnique({ where: { userId } });
  if (!passport) throw new AppError(404, 'PASSPORT_NOT_FOUND', 'Player Passport chưa tồn tại.');
  return {
    userId,
    tier: describeRating({
      rating: passport.ratingMu,
      rd: passport.ratingRd,
      sigma: passport.ratingSigma,
    }).tier,
    matchesPlayed: passport.matchesPlayed,
  };
}
