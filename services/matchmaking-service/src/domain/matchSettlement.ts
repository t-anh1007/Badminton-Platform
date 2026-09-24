import { randomUUID } from 'node:crypto';
import type { MatchConfirmedPayload } from '@khoaluantn/shared';
import type { VenueBookingClient, VenueMatchContext } from '../clients/venueBooking.js';
import { prisma } from '../lib/prisma.js';
import { writeOutbox } from '../lib/outbox.js';

type MatchmakingTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function requestFundingIfReadyInTransaction(
  tx: MatchmakingTransaction,
  matchId: string,
  context: VenueMatchContext,
  now: Date,
): Promise<boolean> {
  const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
  if (match.status !== 'filled' || !match.organizerContributionPaidAt) return false;
  if (match.fundingRequestedAt) return true;
  if (now < match.cutoffAt) return false;
  // A confirmed context means the venue fence already won and its events are
  // still propagating. Never cancel that booking from the cutoff sweep.
  if (context.status === 'confirmed') return true;
  if (context.status !== 'held' || context.bookingId !== match.bookingId) return false;

  const participantCount = await tx.join.count({ where: { matchId, status: 'confirmed' } });
  if (participantCount !== match.capacity - 1) return false;
  const bookingPrice = BigInt(context.priceSnapshot);
  const participantFees = match.feePerSlot * BigInt(participantCount);
  const organizerContribution = bookingPrice - participantFees;
  if (organizerContribution <= 0n || participantFees + organizerContribution !== bookingPrice) {
    throw new Error('Match funding violates D29 conservation');
  }
  const attemptId = randomUUID();
  await tx.match.update({
    where: { id: match.id },
    data: { fundingRequestedAt: now, settlementAttemptId: attemptId },
  });
  await writeOutbox(tx, {
    aggregateType: 'Match',
    aggregateId: match.id,
    eventType: 'MatchConfirmed',
    payload: {
      matchId: match.id,
      bookingId: match.bookingId,
      attemptId,
      venueRevision: match.settlementVenueRevision,
      participantCount,
      participantFees: participantFees.toString(),
      organizerContribution: organizerContribution.toString(),
      bookingPrice: bookingPrice.toString(),
    } satisfies MatchConfirmedPayload,
  });
  return true;
}

export async function requestMatchFundingAtCutoff(
  venueBookingClient: VenueBookingClient,
  matchId: string,
  now: Date,
): Promise<boolean> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { bookingId: true } });
  if (!match) return false;
  const context = await venueBookingClient.getMatchContext(match.bookingId);
  if (!context) return false;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${matchId}, 0))`;
    return requestFundingIfReadyInTransaction(tx, matchId, context, now);
  });
}
