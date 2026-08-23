import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import {
  getOrganizerContribution,
  createMatchContributionSepayIntent,
  handleJoinApproved,
  handleMatchCancelled,
  handleMatchBookingResolved,
  handleMatchConfirmed,
  handleMatchCreated,
  handleMatchFeeRefundRequested,
  payMatchContributionWithBalance,
} from '../src/domain/matchFee.js';
import { ensurePlatformWallet } from '../src/domain/wallet.js';
import { seedPersonalBalance } from './helpers.js';
import { recordBookingRevenue } from '../src/domain/revenue.js';
import { refundCancelledBooking } from '../src/domain/refund.js';
import { handleIncomingTransfer } from '../src/domain/sepayWebhook.js';

const matchIds: string[] = [];
const eventIds: string[] = [];
const userIds: string[] = [];
const sepayExternalRefs: string[] = [];

async function setupFunding(capacity = 4, price = 200000n) {
  const matchId = randomUUID();
  const bookingId = randomUUID();
  const organizerUserId = randomUUID();
  const fee = price / BigInt(capacity);
  const organizerContribution = price - fee * BigInt(capacity - 1);
  const cutoffAt = new Date(Date.now() + 60 * 60_000);
  matchIds.push(matchId);
  userIds.push(organizerUserId);
  const createdEventId = `MatchCreated:${randomUUID()}`;
  eventIds.push(createdEventId);
  await handleMatchCreated(createdEventId, {
    matchId,
    bookingId,
    organizerUserId,
    capacity,
    feePerSlot: fee.toString(),
    bookingPrice: price.toString(),
    organizerContribution: organizerContribution.toString(),
    cutoffAt: cutoffAt.toISOString(),
  });
  const participants = await Promise.all(Array.from({ length: capacity - 1 }, async () => {
    const userId = randomUUID();
    const joinId = randomUUID();
    userIds.push(userId);
    const eventId = `JoinApproved:${randomUUID()}`;
    eventIds.push(eventId);
    await handleJoinApproved(eventId, {
      joinId,
      matchId,
      participantUserId: userId,
      fee: fee.toString(),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    const contribution = await prisma.matchContribution.findUniqueOrThrow({ where: { joinId } });
    return { userId, joinId, contribution };
  }));
  return { matchId, bookingId, organizerUserId, capacity, price, fee, organizerContribution, participants };
}

afterAll(async () => {
  const contributions = await prisma.matchContribution.findMany({
    where: { matchId: { in: matchIds } },
    select: { id: true },
  });
  const contributionIds = contributions.map((item) => item.id);
  const fundings = await prisma.matchFunding.findMany({
    where: { matchId: { in: matchIds } },
    select: { bookingId: true },
  });
  const walletIds = (await prisma.wallet.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  })).map((item) => item.id);
  await prisma.ledgerEntry.deleteMany({
    where: {
      OR: [
        { walletId: { in: walletIds } },
        { refId: { in: [...contributionIds, ...fundings.map((item) => item.bookingId)] } },
      ],
    },
  });
  await prisma.outbox.deleteMany({
    where: { OR: [{ aggregateId: { in: contributionIds } }, { aggregateId: { in: matchIds } }] },
  });
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
  const sepayEvents = await prisma.sepayEvent.findMany({
    where: { externalRef: { in: sepayExternalRefs } }, select: { id: true },
  });
  await prisma.sepayAllocation.deleteMany({ where: { sepayEventId: { in: sepayEvents.map((event) => event.id) } } });
  await prisma.sepayEvent.deleteMany({ where: { externalRef: { in: sepayExternalRefs } } });
  await prisma.paymentIntent.deleteMany({ where: { refId: { in: contributionIds } } });
  await prisma.bookingRevenue.deleteMany({ where: { bookingId: { in: fundings.map((item) => item.bookingId) } } });
  await prisma.matchContribution.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.matchFunding.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
  await prisma.$disconnect();
});

describe('FIN-05 — match contribution ledger', () => {
  it('AC-FIN-05-1/3: participant fees debit personal and reserve platform exactly once', async () => {
    const fixture = await setupFunding();
    const platform = await ensurePlatformWallet();
    const reservedBefore = platform.reserved;

    for (const participant of fixture.participants) {
      await seedPersonalBalance(participant.userId, fixture.fee);
      await payMatchContributionWithBalance(participant.userId, participant.contribution.id);
    }
    await expect(payMatchContributionWithBalance(
      fixture.participants[0]!.userId,
      fixture.participants[0]!.contribution.id,
    )).rejects.toMatchObject({ code: 'MATCH_FEE_ALREADY_PAID' });

    const platformAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } });
    expect(platformAfter.reserved - reservedBefore).toBe(150000n);
    for (const participant of fixture.participants) {
      const personal = await prisma.wallet.findFirstOrThrow({
        where: { userId: participant.userId, walletType: 'personal' },
      });
      expect(personal.available).toBe(0n);
      expect(await prisma.ledgerEntry.count({
        where: { refType: 'matchFee', refId: participant.contribution.id, type: 'payment' },
      })).toBe(1);
    }
  });

  it('AC-FIN-05-3: redelivered SePay match-fee webhook reserves one contribution exactly once', async () => {
    const fixture = await setupFunding();
    const participant = fixture.participants[0]!;
    const platform = await ensurePlatformWallet();
    const before = platform.reserved;
    const intent = await createMatchContributionSepayIntent(participant.userId, participant.contribution.id);
    const externalRef = randomUUID();
    sepayExternalRefs.push(externalRef);

    await handleIncomingTransfer({ externalRef, amount: fixture.fee, rawRef: intent.matchCode });
    await handleIncomingTransfer({ externalRef, amount: fixture.fee, rawRef: intent.matchCode });

    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } })).reserved).toBe(before + fixture.fee);
    expect(await prisma.ledgerEntry.count({
      where: { walletId: platform.id, type: 'reserve', refType: 'matchFee', refId: participant.contribution.id },
    })).toBe(1);
    expect(await prisma.matchContribution.findUniqueOrThrow({ where: { id: participant.contribution.id } }))
      .toMatchObject({ status: 'paid' });
  });

  it('PLAN_MATCH-DEPOSIT: organizer SePay deposit before any participant reserves the contribution', async () => {
    const fixture = await setupFunding();
    const platform = await ensurePlatformWallet();
    const before = platform.reserved;
    const organizer = await getOrganizerContribution(fixture.matchId);
    const intent = await createMatchContributionSepayIntent(fixture.organizerUserId, organizer.id);
    const externalRef = randomUUID();
    sepayExternalRefs.push(externalRef);

    await handleIncomingTransfer({ externalRef, amount: fixture.organizerContribution, rawRef: intent.matchCode });

    expect(await prisma.matchContribution.findUniqueOrThrow({ where: { id: organizer.id } }))
      .toMatchObject({ status: 'paid', paymentMethod: 'sepay' });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } })).reserved)
      .toBe(before + fixture.organizerContribution);
    expect(await prisma.ledgerEntry.count({
      where: { walletId: platform.id, type: 'reserve', refType: 'matchFee', refId: organizer.id },
    })).toBe(1);
  });

  it('AC-FIN-05-2: organizer shortfall plus participant reserves settle the exact booking price', async () => {
    const fixture = await setupFunding();
    const platform = await ensurePlatformWallet();
    const reservedBefore = platform.reserved;
    for (const participant of fixture.participants) {
      await seedPersonalBalance(participant.userId, fixture.fee);
      await payMatchContributionWithBalance(participant.userId, participant.contribution.id);
    }
    const organizer = await getOrganizerContribution(fixture.matchId);
    await seedPersonalBalance(fixture.organizerUserId, fixture.organizerContribution);
    await payMatchContributionWithBalance(fixture.organizerUserId, organizer.id);
    const eventId = `MatchConfirmed:${randomUUID()}`;
    eventIds.push(eventId);
    const attemptId = randomUUID();
    await handleMatchConfirmed(eventId, {
      matchId: fixture.matchId,
      bookingId: fixture.bookingId,
      attemptId,
      venueRevision: 0,
      participantCount: fixture.capacity - 1,
      participantFees: (fixture.fee * BigInt(fixture.capacity - 1)).toString(),
      organizerContribution: fixture.organizerContribution.toString(),
      bookingPrice: fixture.price.toString(),
    });

    // D39 red/green: financial reservation stays intact until Venue's durable
    // command decision arrives; MatchConfirmed alone may not settle a booking.
    const beforeVenue = await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } });
    expect(beforeVenue.reserved).toBe(reservedBefore + fixture.price);
    expect(await prisma.matchFunding.findUniqueOrThrow({ where: { matchId: fixture.matchId } }))
      .toMatchObject({ status: 'settling', settlementAttemptId: attemptId });
    expect(await prisma.ledgerEntry.count({ where: { refType: 'booking', refId: fixture.bookingId, type: 'settlement' } })).toBe(0);
    const venueDecisionEvent = `MatchBookingResolved:${randomUUID()}`;
    eventIds.push(venueDecisionEvent);
    await handleMatchBookingResolved(venueDecisionEvent, {
      commandId: attemptId, matchId: fixture.matchId, bookingId: fixture.bookingId, attemptId,
      action: 'settle', decision: 'confirmed', winningAttemptId: attemptId, venueRevision: 1,
    });

    const platformAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } });
    expect(platformAfter.reserved).toBe(reservedBefore);
    expect(await prisma.ledgerEntry.findFirstOrThrow({
      where: { refType: 'booking', refId: fixture.bookingId, type: 'settlement' },
    })).toMatchObject({ amount: -fixture.price });
    expect(await prisma.matchContribution.count({
      where: { matchId: fixture.matchId, status: 'settled' },
    })).toBe(fixture.capacity);
    expect(await prisma.outbox.count({
      where: { aggregateId: fixture.matchId, eventType: 'PaymentCompleted' },
    })).toBe(1);
  });

  it('AC-FIN-05-4: whole-match cancellation refunds every paid contribution', async () => {
    const fixture = await setupFunding();
    for (const participant of fixture.participants) {
      await seedPersonalBalance(participant.userId, fixture.fee);
      await payMatchContributionWithBalance(participant.userId, participant.contribution.id);
    }
    const eventId = `MatchCancelled:${randomUUID()}`;
    eventIds.push(eventId);
    await handleMatchCancelled(eventId, {
      matchId: fixture.matchId,
      bookingId: fixture.bookingId,
      reason: 'cutoff',
      paidJoinIds: fixture.participants.map((item) => item.joinId),
    });

    for (const participant of fixture.participants) {
      const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId: participant.userId, walletType: 'personal' } });
      expect(wallet.available).toBe(fixture.fee);
    }
    expect(await prisma.matchContribution.count({
      where: { matchId: fixture.matchId, status: 'refunded' },
    })).toBe(fixture.capacity - 1);
  });

  it('AC-FIN-05-5: a pre-cutoff withdrawal refunds only that participant', async () => {
    const fixture = await setupFunding();
    const participant = fixture.participants[0]!;
    await seedPersonalBalance(participant.userId, fixture.fee);
    await payMatchContributionWithBalance(participant.userId, participant.contribution.id);
    const eventId = `MatchFeeRefundRequested:${randomUUID()}`;
    eventIds.push(eventId);
    await handleMatchFeeRefundRequested(eventId, {
      matchId: fixture.matchId,
      joinId: participant.joinId,
      participantUserId: participant.userId,
      reason: 'withdraw_before_cutoff',
    });

    const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId: participant.userId, walletType: 'personal' } });
    expect(wallet.available).toBe(fixture.fee);
    expect(await prisma.matchContribution.findUniqueOrThrow({ where: { id: participant.contribution.id } }))
      .toMatchObject({ status: 'refunded' });
  });

  it('AC-MMP-08-3/D37: confirmed cancellation refunds each contribution and assigns rounding dust to organizer', async () => {
    const fixture = await setupFunding(4, 200007n);
    for (const participant of fixture.participants) {
      await seedPersonalBalance(participant.userId, fixture.fee);
      await payMatchContributionWithBalance(participant.userId, participant.contribution.id);
    }
    const organizer = await getOrganizerContribution(fixture.matchId);
    await seedPersonalBalance(fixture.organizerUserId, fixture.organizerContribution);
    await payMatchContributionWithBalance(fixture.organizerUserId, organizer.id);
    const confirmedEvent = `MatchConfirmed:${randomUUID()}`;
    eventIds.push(confirmedEvent);
    const attemptId = randomUUID();
    await handleMatchConfirmed(confirmedEvent, {
      matchId: fixture.matchId,
      bookingId: fixture.bookingId,
      attemptId,
      venueRevision: 0,
      participantCount: 3,
      participantFees: (fixture.fee * 3n).toString(),
      organizerContribution: fixture.organizerContribution.toString(),
      bookingPrice: fixture.price.toString(),
    });
    await expect(refundCancelledBooking(`BookingCancelled:${randomUUID()}`, {
      bookingId: fixture.bookingId,
      userId: fixture.organizerUserId,
      businessUserId: randomUUID(),
      gross: fixture.price.toString(),
      refundPercent: 50,
      reason: 'self',
    })).rejects.toThrow('awaits D39 settlement resolution');
    const venueDecisionEvent = `MatchBookingResolved:${randomUUID()}`;
    eventIds.push(venueDecisionEvent);
    await handleMatchBookingResolved(venueDecisionEvent, {
      commandId: attemptId, matchId: fixture.matchId, bookingId: fixture.bookingId, attemptId,
      action: 'settle', decision: 'confirmed', winningAttemptId: attemptId, venueRevision: 1,
    });
    const businessUserId = randomUUID();
    userIds.push(businessUserId);
    const revenueEvent = `BookingConfirmed:${randomUUID()}`;
    eventIds.push(revenueEvent);
    await recordBookingRevenue(revenueEvent, {
      bookingId: fixture.bookingId,
      businessUserId,
      venueId: randomUUID(),
      gross: fixture.price.toString(),
      endAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      source: 'marketplace',
    });
    const cancelledEvent = `BookingCancelled:${randomUUID()}`;
    eventIds.push(cancelledEvent);
    await refundCancelledBooking(cancelledEvent, {
      bookingId: fixture.bookingId,
      userId: fixture.organizerUserId,
      businessUserId,
      gross: fixture.price.toString(),
      refundPercent: 50,
      reason: 'self',
    });

    const refunds = await prisma.ledgerEntry.findMany({
      where: { refType: 'matchFeeCancellation', refId: { in: [
        ...fixture.participants.map((item) => item.contribution.id), organizer.id,
      ] } },
    });
    const participantRefunds = refunds.filter((entry) =>
      fixture.participants.some((item) => item.contribution.id === entry.refId));
    const organizerRefund = refunds.find((entry) => entry.refId === organizer.id)!;
    expect(participantRefunds.map((entry) => entry.amount).sort()).toEqual([25000n, 25000n, 25000n]);
    expect(organizerRefund.amount).toBe(25003n);
    expect(refunds.reduce((sum, entry) => sum + entry.amount, 0n)).toBe(100003n);
  });
});
