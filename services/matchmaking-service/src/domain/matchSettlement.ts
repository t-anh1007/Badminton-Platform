import { randomUUID } from 'node:crypto';
import type { MatchConfirmedPayload } from '@khoaluantn/shared';
import type { VenueBookingClient, VenueMatchContext } from '../clients/venueBooking.js';
import { prisma } from '../lib/prisma.js';
import { writeOutbox } from '../lib/outbox.js';
import { RATIO_FROM_DB, calculateMatchFunding } from './matchRules.js';

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
  const paidBooking = match.sourceType === 'paid_booking';
  // Nguồn hold: booking confirmed nghĩa là fence của Venue đã thắng và event đang lan tỏa;
  // không hủy booking đó từ sweep. Nguồn booking đã thanh toán luôn confirmed từ đầu.
  if (context.status === 'confirmed' && !paidBooking) return true;
  if (context.status !== (paidBooking ? 'confirmed' : 'held') || context.bookingId !== match.bookingId) return false;

  const participantCount = await tx.join.count({ where: { matchId, status: 'confirmed' } });
  if (participantCount !== match.capacity - 1) return false;
  const bookingPrice = BigInt(context.priceSnapshot);
  const participantFees = match.feePerSlot * BigInt(participantCount);
  let organizerContribution = bookingPrice - participantFees;
  let resultReserve = 0n;
  if (match.bookingPrice !== null) {
    if (match.bookingPrice !== bookingPrice) throw new Error('Match booking price snapshot differs from Venue');
    const funding = calculateMatchFunding(bookingPrice, RATIO_FROM_DB[match.ratio], match.capacity as 2 | 4);
    organizerContribution = funding.organizerContribution;
    resultReserve = funding.resultReserve;
  }
  if (organizerContribution <= 0n || participantFees + organizerContribution !== bookingPrice + resultReserve) {
    throw new Error('Match funding violates competitive-match conservation');
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
      sourceType: match.sourceType,
      resultReserve: resultReserve.toString(),
      totalContribution: (bookingPrice + resultReserve).toString(),
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
