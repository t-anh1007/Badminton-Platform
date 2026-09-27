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
import { ensurePlatformWallet, postLedgerEntry } from '../src/domain/wallet.js';
import { seedPersonalBalance } from './helpers.js';
import { recordBookingRevenue } from '../src/domain/revenue.js';
import { refundCancelledBooking } from '../src/domain/refund.js';
import { handleIncomingTransfer } from '../src/domain/sepayWebhook.js';

const matchIds: string[] = [];
const eventIds: string[] = [];
const userIds: string[] = [];
const sepayExternalRefs: string[] = [];
const shutdownOutboxAggregateIds: string[] = [];

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
    where: { OR: [
      { aggregateId: { in: contributionIds } }, { aggregateId: { in: matchIds } },
      { aggregateId: { in: shutdownOutboxAggregateIds } },
    ] },
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

  it('shutdown cancellation refunds paid match contributors and emits completion once', async () => {
    const fixture = await setupFunding(3, 210000n);
    const contributors = [
      { userId: fixture.organizerUserId, contribution: await getOrganizerContribution(fixture.matchId) },
      ...fixture.participants.map(({ userId, contribution }) => ({ userId, contribution })),
    ];
    for (const contributor of contributors) {
      await seedPersonalBalance(contributor.userId, contributor.contribution.amount);
      await payMatchContributionWithBalance(contributor.userId, contributor.contribution.id);
    }
    const shutdownId = randomUUID();
    const bookingBusinessCode = 'BK-00004218';
    const eventId = `MatchCancelled:${randomUUID()}`;
    eventIds.push(eventId);
    shutdownOutboxAggregateIds.push(fixture.bookingId, ...contributors.map(({ contribution }) => `shutdown.refund:${contribution.id}`));

    await handleMatchCancelled(eventId, {
      matchId: fixture.matchId,
      bookingId: fixture.bookingId,
      reason: 'shutdown',
      paidJoinIds: fixture.participants.map(({ joinId }) => joinId),
      refundPercent: 100,
      shutdownId,
      bookingBusinessCode,
    });

    expect(await prisma.matchFunding.findUniqueOrThrow({ where: { matchId: fixture.matchId } }))
      .toMatchObject({ status: 'cancelled' });
    for (const contributor of contributors) {
      const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId: contributor.userId, walletType: 'personal' } });
      expect(wallet.available).toBe(contributor.contribution.amount);
    }
    expect(await prisma.outbox.findFirstOrThrow({
      where: { aggregateType: 'Booking', aggregateId: fixture.bookingId, eventType: 'BookingRefundCompleted' },
    })).toMatchObject({ payload: { bookingId: fixture.bookingId, shutdownId } });
    expect(await prisma.outbox.count({
      where: { aggregateId: { in: contributors.map(({ contribution }) => `shutdown.refund:${contribution.id}`) }, eventType: 'UserNotificationRequested' },
    })).toBe(contributors.length);

    await handleMatchCancelled(eventId, {
      matchId: fixture.matchId,
      bookingId: fixture.bookingId,
      reason: 'shutdown',
      paidJoinIds: fixture.participants.map(({ joinId }) => joinId),
      refundPercent: 100,
      shutdownId,
      bookingBusinessCode,
    });
    expect(await prisma.outbox.count({
      where: { aggregateType: 'Booking', aggregateId: fixture.bookingId, eventType: 'BookingRefundCompleted' },
    })).toBe(1);
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

  // D56 thay D37: phần hoàn booking chia 50:50 theo đội (BR-CM-20); JOIN cũ không có đội thuộc đội B.
  it('AC-CM-10: confirmed cancellation splits the booking refund 50:50 by team and assigns rounding dust to organizer', async () => {
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
    expect(participantRefunds.map((entry) => entry.amount).sort()).toEqual([16667n, 16667n, 16667n]);
    expect(organizerRefund.amount).toBe(50002n);
    expect(refunds.reduce((sum, entry) => sum + entry.amount, 0n)).toBe(100003n);
  });
});

describe('Competitive matches v2 — funding with result reserve (Tasks 6-7)', () => {
  async function created(input: {
    sourceType: 'hold' | 'paid_booking'; discipline: 'singles' | 'doubles'; ratio: '5:5' | '6:4' | '7:3';
    price: bigint; reserve: bigint; fee: bigint; organizer: bigint;
  }) {
    const matchId = randomUUID(); const bookingId = randomUUID(); const organizerUserId = randomUUID();
    matchIds.push(matchId); userIds.push(organizerUserId);
    const capacity = input.discipline === 'doubles' ? 4 : 2;
    const eventId = `MatchCreated:${randomUUID()}`; eventIds.push(eventId);
    const payload = {
      matchId, bookingId, organizerUserId, capacity, feePerSlot: input.fee.toString(), bookingPrice: input.price.toString(),
      organizerContribution: input.organizer.toString(), cutoffAt: new Date(Date.now() + 3_600_000).toISOString(),
      ...(input.sourceType === 'hold' ? { depositExpiresAt: new Date(Date.now() + 600_000).toISOString() } : {}),
      sourceType: input.sourceType, mode: 'friendly' as const, discipline: input.discipline, ratio: input.ratio,
      teamSize: (capacity / 2) as 1 | 2, resultReserve: input.reserve.toString(), totalContribution: (input.price + input.reserve).toString(),
    };
    await handleMatchCreated(eventId, payload);
    await handleMatchCreated(eventId, payload);
    const join = async (teamSide: 'A' | 'B') => {
      const userId = randomUUID(); const joinId = randomUUID(); userIds.push(userId);
      const joinEvent = `JoinApproved:${randomUUID()}`; eventIds.push(joinEvent);
      await handleJoinApproved(joinEvent, { joinId, matchId, participantUserId: userId, fee: input.fee.toString(), expiresAt: new Date(Date.now() + 600_000).toISOString(), teamSide });
      return { userId, contribution: await prisma.matchContribution.findUniqueOrThrow({ where: { joinId } }) };
    };
    return { matchId, bookingId, organizerUserId, join, payload };
  }

  it('Task 6: a legacy MatchCreated keeps the hold source with total = booking price and no result reserve', async () => {
    const fixture = await setupFunding(2, 200001n);
    expect(await prisma.matchFunding.findUniqueOrThrow({ where: { matchId: fixture.matchId } })).toMatchObject({
      sourceType: 'hold', discipline: 'singles', ratio: '5:5', totalContribution: 200001n, resultReserve: 0n,
      resultReserveStatus: 'none', organizerRebalance: 0n, resultFinalizedAt: null,
    });
  });

  it('AC-CM-04: hold 7:3 singles collects P + reserve and rejects a payload that breaks conservation', async () => {
    const hold = await created({ sourceType: 'hold', discipline: 'singles', ratio: '7:3', price: 200000n, reserve: 80000n, fee: 140000n, organizer: 140000n });
    expect(await prisma.matchFunding.findUniqueOrThrow({ where: { matchId: hold.matchId } }))
      .toMatchObject({ sourceType: 'hold', totalContribution: 280000n, resultReserve: 80000n, ratio: '7:3' });
    expect(await getOrganizerContribution(hold.matchId)).toMatchObject({ status: 'pending', source: 'cash', teamSide: 'A', amount: 140000n });
    const broken = { ...hold.payload, matchId: randomUUID(), totalContribution: '280001' };
    await expect(handleMatchCreated(`MatchCreated:${randomUUID()}`, broken)).rejects.toThrow(/conservation/);
  });

  it('AC-CM-06/BR-CM-14: paid booking funds the organizer without an intent or reserve entry; only cash is reserved', async () => {
    const paid = await created({ sourceType: 'paid_booking', discipline: 'doubles', ratio: '6:4', price: 200001n, reserve: 40000n, fee: 60000n, organizer: 60001n });
    const organizer = await getOrganizerContribution(paid.matchId);
    expect(organizer).toMatchObject({ status: 'paid', source: 'booking_payment', teamSide: 'A', amount: 60001n, paymentIntentId: null });
    await expect(payMatchContributionWithBalance(paid.organizerUserId, organizer.id)).rejects.toMatchObject({ code: 'MATCH_FEE_ALREADY_PAID' });
    await expect(createMatchContributionSepayIntent(paid.organizerUserId, organizer.id)).rejects.toMatchObject({ code: 'MATCH_FEE_ALREADY_PAID' });

    const platform = await ensurePlatformWallet();
    const before = (await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } })).reserved;
    const players = [await paid.join('A'), await paid.join('B'), await paid.join('B')];
    for (const player of players) {
      await seedPersonalBalance(player.userId, 60000n);
      await payMatchContributionWithBalance(player.userId, player.contribution.id);
    }
    expect(players.map((p) => p.contribution.teamSide)).toEqual(['A', 'B', 'B']);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } })).reserved).toBe(before + 180000n);
    expect(await prisma.ledgerEntry.count({ where: { refId: organizer.id } })).toBe(0);

    // Hủy lớp kèo trước hạn chốt: hoàn đúng tiền mặt của người tham gia, không tạo tiền cho chủ kèo.
    const cancelEvent = `MatchCancelled:${randomUUID()}`; eventIds.push(cancelEvent);
    await handleMatchCancelled(cancelEvent, { matchId: paid.matchId, bookingId: paid.bookingId, reason: 'organizer', paidJoinIds: [] });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } })).reserved).toBe(before);
    expect(await prisma.ledgerEntry.count({ where: { refId: organizer.id } })).toBe(0);
    for (const player of players) {
      expect(await prisma.wallet.findFirstOrThrow({ where: { userId: player.userId, walletType: 'personal' } })).toMatchObject({ withdrawable: 60000n });
    }
  });

  it('AC-CM-08: a receipt after the contribution stopped being payable credits available and withdrawable once', async () => {
    const hold = await created({ sourceType: 'hold', discipline: 'singles', ratio: '6:4', price: 200000n, reserve: 40000n, fee: 120000n, organizer: 120000n });
    const player = await hold.join('B');
    const intent = await createMatchContributionSepayIntent(player.userId, player.contribution.id);
    await prisma.matchFunding.update({ where: { matchId: hold.matchId }, data: { cutoffAt: new Date(Date.now() - 1_000) } });
    const externalRef = randomUUID(); sepayExternalRefs.push(externalRef);
    await handleIncomingTransfer({ externalRef, amount: 120000n, rawRef: intent.matchCode });
    await handleIncomingTransfer({ externalRef, amount: 120000n, rawRef: intent.matchCode });
    expect(await prisma.wallet.findFirstOrThrow({ where: { userId: player.userId, walletType: 'personal' } }))
      .toMatchObject({ available: 120000n, withdrawable: 120000n });
    expect(await prisma.matchContribution.findUniqueOrThrow({ where: { id: player.contribution.id } })).toMatchObject({ status: 'pending' });
  });
});

describe('Competitive matches v2 — cutoff without double settlement (Task 8)', () => {
  async function paidAndFilled(price: bigint, reserve: bigint, fee: bigint, organizer: bigint) {
    const matchId = randomUUID(); const bookingId = randomUUID(); const organizerUserId = randomUUID(); const businessUserId = randomUUID();
    matchIds.push(matchId); userIds.push(organizerUserId, businessUserId);
    const revenueEvent = `BookingConfirmed:${randomUUID()}`; eventIds.push(revenueEvent);
    await recordBookingRevenue(revenueEvent, {
      bookingId, businessUserId, venueId: randomUUID(), gross: price.toString(),
      endAt: new Date(Date.now() + 48 * 3_600_000).toISOString(), source: 'marketplace',
    });
    const createdEvent = `MatchCreated:${randomUUID()}`; eventIds.push(createdEvent);
    await handleMatchCreated(createdEvent, {
      matchId, bookingId, organizerUserId, capacity: 4, feePerSlot: fee.toString(), bookingPrice: price.toString(),
      organizerContribution: organizer.toString(), cutoffAt: new Date(Date.now() + 3_600_000).toISOString(),
      sourceType: 'paid_booking', mode: 'ranked', discipline: 'doubles', ratio: '6:4', teamSize: 2,
      resultReserve: reserve.toString(), totalContribution: (price + reserve).toString(),
    });
    for (const teamSide of ['A', 'B', 'B'] as const) {
      const userId = randomUUID(); const joinId = randomUUID(); userIds.push(userId);
      const joinEvent = `JoinApproved:${randomUUID()}`; eventIds.push(joinEvent);
      await handleJoinApproved(joinEvent, { joinId, matchId, participantUserId: userId, fee: fee.toString(), expiresAt: new Date(Date.now() + 600_000).toISOString(), teamSide });
      const contribution = await prisma.matchContribution.findUniqueOrThrow({ where: { joinId } });
      await seedPersonalBalance(userId, fee);
      await payMatchContributionWithBalance(userId, contribution.id);
    }
    const confirmed = {
      matchId, bookingId, attemptId: randomUUID(), venueRevision: 0, participantCount: 3,
      participantFees: (fee * 3n).toString(), organizerContribution: organizer.toString(), bookingPrice: price.toString(),
      sourceType: 'paid_booking' as const, resultReserve: reserve.toString(), totalContribution: (price + reserve).toString(),
    };
    return { matchId, bookingId, organizerUserId, confirmed };
  }

  const snapshot = async (bookingId: string, matchId: string, organizerUserId: string) => {
    const platform = await ensurePlatformWallet();
    return {
      reserved: (await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } })).reserved,
      revenues: await prisma.bookingRevenue.count({ where: { bookingId } }),
      bookingLedger: await prisma.ledgerEntry.count({ where: { refType: 'booking', refId: bookingId } }),
      rebalances: await prisma.ledgerEntry.count({ where: { refType: 'matchOwnerRebalance', refId: matchId } }),
      organizer: await prisma.wallet.findFirst({ where: { userId: organizerUserId, walletType: 'personal' } }),
      completed: await prisma.outbox.count({ where: { aggregateId: matchId, eventType: 'MatchFundingCompleted' } }),
    };
  };

  it('AC-CM-06: paid-booking cutoff reuses revenue/commission, rebalances the owner once and keeps exactly the reserve, even on replay', async () => {
    const fixture = await paidAndFilled(200001n, 40000n, 60000n, 60001n);
    const before = await snapshot(fixture.bookingId, fixture.matchId, fixture.organizerUserId);
    const first = `MatchConfirmed:${randomUUID()}`; const replayWithNewId = `MatchConfirmed:${randomUUID()}`; eventIds.push(first, replayWithNewId);

    await handleMatchConfirmed(first, fixture.confirmed);
    await handleMatchConfirmed(first, fixture.confirmed);
    await handleMatchConfirmed(replayWithNewId, fixture.confirmed);

    const after = await snapshot(fixture.bookingId, fixture.matchId, fixture.organizerUserId);
    expect(after.reserved).toBe(before.reserved - 140000n);
    expect(after).toMatchObject({ revenues: before.revenues, bookingLedger: before.bookingLedger, rebalances: before.rebalances + 2, completed: 1 });
    expect(after.organizer).toMatchObject({ available: 140000n, withdrawable: 140000n });
    expect(await prisma.matchFunding.findUniqueOrThrow({ where: { matchId: fixture.matchId } })).toMatchObject({
      status: 'settled', organizerRebalance: 140000n, resultReserve: 40000n, resultReserveStatus: 'locked', settlementAttemptId: null,
    });
    expect(await prisma.outbox.count({ where: { aggregateId: fixture.matchId, eventType: 'MatchSettlementRequested' } })).toBe(0);
  });

  it('fails closed when the paid booking has no existing BookingRevenue', async () => {
    const fixture = await paidAndFilled(150000n, 30000n, 45000n, 45000n);
    await prisma.bookingRevenue.delete({ where: { bookingId: fixture.bookingId } });
    const eventId = `MatchConfirmed:${randomUUID()}`; eventIds.push(eventId);
    await expect(handleMatchConfirmed(eventId, fixture.confirmed)).rejects.toThrow(/BookingRevenue/);
    expect(await prisma.matchFunding.findUniqueOrThrow({ where: { matchId: fixture.matchId } })).toMatchObject({ status: 'collecting' });
    expect(await prisma.ledgerEntry.count({ where: { refType: 'matchOwnerRebalance', refId: fixture.matchId } })).toBe(0);
  });

  const cancelPayload = (fixture: { bookingId: string; organizerUserId: string }, businessUserId: string, gross: bigint) => ({
    bookingId: fixture.bookingId, userId: fixture.organizerUserId, businessUserId, gross: gross.toString(), refundPercent: 100, reason: 'provider_fault' as const,
  });
  const businessOf = async (bookingId: string) => (await prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId } })).businessUserId;
  // Bút toán FIN-03 gốc: chủ booking đã trả P bằng số dư trước khi booking thành kèo.
  const seedOwnerBookingPayment = async (fixture: { bookingId: string; organizerUserId: string }, gross: bigint) => {
    await seedPersonalBalance(fixture.organizerUserId, gross);
    const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId: fixture.organizerUserId, walletType: 'personal' } });
    await prisma.$transaction((tx) => postLedgerEntry(tx, { walletId: wallet.id, amount: -gross, type: 'payment', refType: 'booking', refId: fixture.bookingId }));
  };

  it('G2 fix: after the match layer closes, cancelling the ordinary paid booking still refunds its owner', async () => {
    const fixture = await paidAndFilled(200000n, 40000n, 60000n, 60000n);
    await seedOwnerBookingPayment(fixture, 200000n);
    const closeEvent = `MatchCancelled:${randomUUID()}`; eventIds.push(closeEvent);
    await handleMatchCancelled(closeEvent, { matchId: fixture.matchId, bookingId: fixture.bookingId, reason: 'organizer', paidJoinIds: [] });
    const ownerBefore = (await prisma.wallet.findFirst({ where: { userId: fixture.organizerUserId, walletType: 'personal' } }))?.available ?? 0n;
    const cancelEvent = `BookingCancelled:${randomUUID()}`; eventIds.push(cancelEvent);
    await refundCancelledBooking(cancelEvent, cancelPayload(fixture, await businessOf(fixture.bookingId), 200000n));
    expect((await prisma.wallet.findFirstOrThrow({ where: { userId: fixture.organizerUserId, walletType: 'personal' } })).available).toBe(ownerBefore + 200000n);
  });

  it('G2 fix: concurrent cutoff rebalance and booking cancellation never pay the owner twice', async () => {
    const fixture = await paidAndFilled(200000n, 40000n, 60000n, 60000n);
    await seedOwnerBookingPayment(fixture, 200000n);
    const confirmedEvent = `MatchConfirmed:${randomUUID()}`; const cancelEvent = `BookingCancelled:${randomUUID()}`; eventIds.push(confirmedEvent, cancelEvent);
    const results = await Promise.allSettled([
      handleMatchConfirmed(confirmedEvent, fixture.confirmed),
      refundCancelledBooking(cancelEvent, cancelPayload(fixture, await businessOf(fixture.bookingId), 200000n)),
    ]);
    const rebalances = await prisma.ledgerEntry.count({ where: { refType: 'matchOwnerRebalance', refId: fixture.matchId, amount: { gt: 0n } } });
    const ordinaryOwnerRefunds = await prisma.ledgerEntry.count({ where: { refType: 'booking', refId: fixture.bookingId, type: 'refund', amount: 200000n } });
    // Hoặc kèo chốt trước rồi hủy booking chia 50:50 theo đội, hoặc hủy booking trước rồi chốt kèo bị từ chối.
    expect(rebalances + ordinaryOwnerRefunds).toBe(1);
    if (ordinaryOwnerRefunds === 1) expect(results[0].status).toBe('rejected');
  });
});

describe('Competitive matches v2 — booking cancelled before the result (Task 9)', () => {
  async function settledHoldDoubles() {
    const matchId = randomUUID(); const bookingId = randomUUID(); const organizerUserId = randomUUID(); const businessUserId = randomUUID();
    matchIds.push(matchId); userIds.push(organizerUserId, businessUserId);
    const createdEvent = `MatchCreated:${randomUUID()}`; eventIds.push(createdEvent);
    await handleMatchCreated(createdEvent, {
      matchId, bookingId, organizerUserId, capacity: 4, feePerSlot: '60000', bookingPrice: '200001', organizerContribution: '60001',
      cutoffAt: new Date(Date.now() + 3_600_000).toISOString(), depositExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      sourceType: 'hold', mode: 'friendly', discipline: 'doubles', ratio: '6:4', teamSize: 2, resultReserve: '40000', totalContribution: '240001',
    });
    const organizer = await getOrganizerContribution(matchId);
    await seedPersonalBalance(organizerUserId, 60001n);
    await payMatchContributionWithBalance(organizerUserId, organizer.id);
    const players: string[] = [];
    for (const teamSide of ['A', 'B', 'B'] as const) {
      const userId = randomUUID(); const joinId = randomUUID(); userIds.push(userId); players.push(userId);
      const joinEvent = `JoinApproved:${randomUUID()}`; eventIds.push(joinEvent);
      await handleJoinApproved(joinEvent, { joinId, matchId, participantUserId: userId, fee: '60000', expiresAt: new Date(Date.now() + 600_000).toISOString(), teamSide });
      const contribution = await prisma.matchContribution.findUniqueOrThrow({ where: { joinId } });
      await seedPersonalBalance(userId, 60000n);
      await payMatchContributionWithBalance(userId, contribution.id);
    }
    const attemptId = randomUUID();
    const confirmedEvent = `MatchConfirmed:${randomUUID()}`; const resolvedEvent = `MatchBookingResolved:${randomUUID()}`; const revenueEvent = `BookingConfirmed:${randomUUID()}`;
    eventIds.push(confirmedEvent, resolvedEvent, revenueEvent);
    await handleMatchConfirmed(confirmedEvent, {
      matchId, bookingId, attemptId, venueRevision: 0, participantCount: 3, participantFees: '180000', organizerContribution: '60001',
      bookingPrice: '200001', sourceType: 'hold', resultReserve: '40000', totalContribution: '240001',
    });
    await handleMatchBookingResolved(resolvedEvent, { commandId: attemptId, matchId, bookingId, attemptId, action: 'settle', decision: 'confirmed', winningAttemptId: attemptId, venueRevision: 1 });
    await recordBookingRevenue(revenueEvent, { bookingId, businessUserId, venueId: randomUUID(), gross: '200001', endAt: new Date(Date.now() + 48 * 3_600_000).toISOString(), source: 'marketplace' });
    return { matchId, bookingId, organizerUserId, businessUserId, players };
  }
  const withdrawable = async (userId: string) => (await prisma.wallet.findFirstOrThrow({ where: { userId, walletType: 'personal' } })).withdrawable;

  it.each([
    // [lý do, % hoàn booking, phần mỗi người đội A khác chủ kèo, mỗi người đội B, chủ kèo]
    ['provider_fault', 100, 60000n, 60000n, 60001n],
    ['self', 50, 35000n, 35000n, 35000n],
    ['self', 0, 10000n, 10000n, 10000n],
  ] as const)('AC-CM-10: %s %s%% refunds the whole reserve and splits (reserve + booking refund) 50:50 by team', async (reason, percent, partner, teamB, organizerShare) => {
    const fixture = await settledHoldDoubles();
    const platform = await ensurePlatformWallet();
    const reservedBefore = (await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } })).reserved;
    const eventId = `BookingCancelled:${randomUUID()}`; eventIds.push(eventId);
    const payload = { bookingId: fixture.bookingId, userId: fixture.organizerUserId, businessUserId: fixture.businessUserId, gross: '200001', refundPercent: percent, reason };
    await refundCancelledBooking(eventId, payload);
    await refundCancelledBooking(eventId, payload);

    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } })).reserved).toBe(reservedBefore - 40000n);
    const [p1, p2, p3] = fixture.players;
    expect(await withdrawable(p1!)).toBe(partner);
    expect(await withdrawable(p2!)).toBe(teamB);
    expect(await withdrawable(p3!)).toBe(teamB);
    expect(await withdrawable(fixture.organizerUserId)).toBe(organizerShare);
    const refundGross = (200001n * BigInt(reason === 'self' ? percent : 100)) / 100n;
    expect(partner + teamB * 2n + organizerShare).toBe(refundGross + 40000n);
    expect(await prisma.matchFunding.findUniqueOrThrow({ where: { matchId: fixture.matchId } }))
      .toMatchObject({ status: 'cancelled', resultReserveStatus: 'refunded' });
  });
});
