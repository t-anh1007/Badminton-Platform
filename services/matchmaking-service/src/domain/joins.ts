import { AppError } from '../lib/errors.js';
import { calculateCompatibility } from '@khoaluantn/ai';
import type { JoinApprovedPayload } from '@khoaluantn/shared';
import { writeOutbox } from '../lib/outbox.js';
import { prisma } from '../lib/prisma.js';
import { describeRating, INITIAL_RD, TIER_CENTERS } from './rating.js';

export const JOIN_HOLD_MINUTES = 10;

async function assertOrganizer(matchId: string, organizerUserId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
  if (match.organizerUserId !== organizerUserId) {
    throw new AppError(403, 'MATCH_ORGANIZER_ONLY', 'Chỉ organizer của kèo được xét duyệt người chơi.');
  }
  return match;
}

export async function listPendingJoins(matchId: string, organizerUserId: string) {
  const match = await assertOrganizer(matchId, organizerUserId);
  const joins = await prisma.join.findMany({
    where: { matchId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });
  const passports = await prisma.passport.findMany({
    where: {
      userId: {
        in: [match.organizerUserId, ...joins.map((join) => join.participantUserId)],
      },
    },
  });
  const byUserId = new Map(passports.map((passport) => [passport.userId, passport]));
  const organizerPassport = byUserId.get(match.organizerUserId);
  const rangeMin = match.skillMin ?? match.skillMax;
  const rangeMax = match.skillMax ?? match.skillMin;
  const targetRating =
    rangeMin && rangeMax
      ? (TIER_CENTERS[rangeMin] + TIER_CENTERS[rangeMax]) / 2
      : (organizerPassport?.ratingMu ?? 1500);
  const targetRd = organizerPassport?.ratingRd ?? INITIAL_RD;
  return joins.map((join) => {
    const passport = byUserId.get(join.participantUserId);
    const compatibility = calculateCompatibility({
      player: {
        rating: passport?.ratingMu ?? 1500,
        rd: passport?.ratingRd ?? INITIAL_RD,
      },
      match: {
        targetRating,
        targetRd,
        // No preference model is persisted yet. Do not award or claim a match
        // for time/location until the evidence is available.
        timeMatches: false,
        locationMatches: false,
      },
    });
    return {
      ...join,
      participantTier: passport
        ? describeRating({
            rating: passport.ratingMu,
            rd: passport.ratingRd,
            sigma: passport.ratingSigma,
          }).tier
        : null,
      compatibilityScore: compatibility.score,
      compatibilityExplanation: compatibility.explanation,
    };
  });
}

export async function rejectJoin(matchId: string, joinId: string, organizerUserId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${matchId}, 0))`;
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
    if (match.organizerUserId !== organizerUserId) {
      throw new AppError(403, 'MATCH_ORGANIZER_ONLY', 'Chỉ organizer của kèo được xét duyệt người chơi.');
    }
    const join = await tx.join.findUnique({ where: { id: joinId } });
    if (!join || join.matchId !== matchId) throw new AppError(404, 'JOIN_NOT_FOUND', 'Không tìm thấy yêu cầu.');
    if (join.status !== 'pending') throw new AppError(409, 'JOIN_NOT_PENDING', 'Yêu cầu không còn chờ duyệt.');
    return tx.join.update({ where: { id: join.id }, data: { status: 'rejected' } });
  });
}

export async function approveJoin(matchId: string, joinId: string, organizerUserId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${matchId}, 0))`;
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Không tìm thấy kèo.');
    if (match.organizerUserId !== organizerUserId) {
      throw new AppError(403, 'MATCH_ORGANIZER_ONLY', 'Chỉ organizer của kèo được duyệt người chơi.');
    }
    const join = await tx.join.findUnique({ where: { id: joinId } });
    if (!join || join.matchId !== matchId) throw new AppError(404, 'JOIN_NOT_FOUND', 'Không tìm thấy yêu cầu.');
    if (join.status !== 'pending') throw new AppError(409, 'JOIN_NOT_PENDING', 'Yêu cầu không còn chờ duyệt.');
    const reservedCount = await tx.join.count({
      where: { matchId, status: { in: ['approved', 'confirmed'] } },
    });
    if (match.status !== 'open') {
      if (match.status === 'filled') {
        throw new AppError(409, 'MATCH_FULL', 'Kèo đã hết chỗ.');
      }
      throw new AppError(409, 'MATCH_NOT_OPEN', 'Kèo không còn mở.');
    }
    if (reservedCount + 1 >= match.capacity) {
      throw new AppError(409, 'MATCH_FULL', 'Kèo đã hết chỗ.');
    }

    const updated = await tx.join.update({
      where: { id: join.id },
      data: {
        status: match.feePerSlot === 0n ? 'confirmed' : 'approved',
        approvedAt: now,
      },
    });
    if (match.feePerSlot === 0n && reservedCount + 1 === match.capacity - 1) {
      await tx.match.update({ where: { id: match.id }, data: { status: 'filled' } });
    }
    await writeOutbox(tx, {
      aggregateType: 'Join',
      aggregateId: join.id,
      eventType: 'JoinApproved',
      payload: {
        joinId: join.id,
        matchId,
        participantUserId: join.participantUserId,
        fee: match.feePerSlot.toString(),
        expiresAt: new Date(now.getTime() + JOIN_HOLD_MINUTES * 60_000).toISOString(),
      } satisfies JoinApprovedPayload,
    });
    return updated;
  });
}

export async function releaseExpiredApprovedJoins(now = new Date()): Promise<number> {
  const threshold = new Date(now.getTime() - JOIN_HOLD_MINUTES * 60_000);
  const result = await prisma.join.updateMany({
    where: { status: 'approved', approvedAt: { lte: threshold } },
    data: { status: 'pending', approvedAt: null },
  });
  return result.count;
}

export function startJoinExpiryScheduler(
  intervalMs = 30_000,
  sweep: () => Promise<number> = releaseExpiredApprovedJoins,
): () => Promise<void> {
  let inFlight: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = sweep()
      .then(() => undefined)
      .catch((error) => console.error('[matchmaking-service join expiry]', error))
      .finally(() => {
        inFlight = undefined;
      });
  }, intervalMs);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await inFlight;
  };
}
