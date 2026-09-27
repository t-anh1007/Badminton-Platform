import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { MatchBookingResolutionPayload, MatchFeePaymentCompletedPayload } from '@khoaluantn/shared';
import type { VenueBookingClient, VenueMatchContext } from '../src/clients/venueBooking.js';
import {
  handleBookingConfirmedForMatch,
  handleMatchFeePaymentCompleted,
} from '../src/lib/matchLifecycleEventConsumer.js';
import { prisma } from '../src/lib/prisma.js';
import { cancelMatchByOrganizer, cancelMatchesAtCutoff, withdrawJoin } from '../src/domain/matchLifecycle.js';
import { requestJoin } from '../src/domain/matches.js';

class FakeVenueClient implements VenueBookingClient {
  readonly contexts = new Map<string, VenueMatchContext>();
  readonly staleCancelOnce = new Set<string>();
  getMatchContext(bookingId: string) { return Promise.resolve(this.contexts.get(bookingId) ?? null); }
  createBookingFromHold(): Promise<string> { throw new Error('not used'); }
  cancelConfirmedBooking(): Promise<{ refundPercent: number }> { return Promise.resolve({ refundPercent: 50 }); }
  resolveMatchBooking(input: {
    commandId: string; matchId: string; attemptId: string | null;
    action: 'withdraw' | 'cancel'; venueRevision: number;
  }, bookingId: string): Promise<MatchBookingResolutionPayload> {
    const context = this.contexts.get(bookingId)!;
    if (context.status === 'confirmed') {
      return Promise.resolve({
        ...input, bookingId, decision: 'confirmed', winningAttemptId: input.attemptId,
        venueRevision: input.venueRevision,
      });
    }
    if (input.action === 'cancel') {
      if (this.staleCancelOnce.delete(bookingId)) {
        return Promise.resolve({
          ...input, bookingId, decision: 'held_revoked', winningAttemptId: null,
          venueRevision: input.venueRevision + 1,
        });
      }
      this.contexts.set(bookingId, { ...context, status: 'cancelled' });
      return Promise.resolve({
        ...input, bookingId, decision: 'cancelled', winningAttemptId: null,
        venueRevision: input.venueRevision + 1,
      });
    }
    return Promise.resolve({
      ...input, bookingId, decision: 'held_revoked', winningAttemptId: null,
      venueRevision: input.venueRevision + 1,
    });
  }
}

class CrashAfterConfirmedBookingCancelClient extends FakeVenueClient {
  private firstCancellation = true;

  async cancelConfirmedBooking(): Promise<{ refundPercent: number }> {
    if (this.firstCancellation) {
      this.firstCancellation = false;
      throw new Error('simulated timeout after durable Venue cancellation');
    }
    return { refundPercent: 50 };
  }
}

const venueClient = new FakeVenueClient();
const matchIds: string[] = [];
const eventIds: string[] = [];

async function fixture(capacity = 2) {
  const bookingId = randomUUID();
  const organizerUserId = randomUUID();
  const match = await prisma.match.create({
    data: {
      bookingId,
      organizerUserId,
      capacity,
      feePerSlot: 50000n,
      cutoffAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  matchIds.push(match.id);
  venueClient.contexts.set(bookingId, {
    bookingId,
    ownerUserId: organizerUserId,
    status: 'held',
    priceSnapshot: (50000n * BigInt(capacity)).toString(),
    startAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
    endAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    court: { id: randomUUID(), name: 'Sân M3' },
    venue: { id: randomUUID(), name: 'Venue M3', address: 'Q1', lat: 10, lng: 106 },
  });
  return match;
}

function paymentPayload(
  match: Awaited<ReturnType<typeof fixture>>,
  input: { contributionId?: string; joinId: string | null; userId: string; role: 'participant' | 'organizer' },
): MatchFeePaymentCompletedPayload {
  return {
    refType: 'matchFee',
    matchId: match.id,
    bookingId: match.bookingId,
    contributionId: input.contributionId ?? randomUUID(),
    joinId: input.joinId,
    userId: input.userId,
    role: input.role,
    amount: '50000',
    paidAt: new Date().toISOString(),
  };
}

afterAll(async () => {
  await prisma.outbox.deleteMany({ where: { aggregateId: { in: matchIds } } });
  const joins = await prisma.join.findMany({ where: { matchId: { in: matchIds } }, select: { id: true } });
  await prisma.outbox.deleteMany({ where: { aggregateId: { in: joins.map((join) => join.id) } } });
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.matchResolution.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.join.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.$disconnect();
});

describe('MMP-06 — match fee payment events', () => {
  it('keeps a fully paid match held until its matchmaking cutoff', async () => {
    const match = await fixture(2);
    const participantUserId = randomUUID();
    const join = await prisma.join.create({
      data: {
        matchId: match.id,
        participantUserId,
        status: 'approved',
        approvedAt: new Date(),
      },
    });
    const participantEvent = `PaymentCompleted:${randomUUID()}`;
    eventIds.push(participantEvent);
    await handleMatchFeePaymentCompleted(
      participantEvent,
      paymentPayload(match, { joinId: join.id, userId: participantUserId, role: 'participant' }),
      venueClient,
    );
    expect(await prisma.join.findUniqueOrThrow({ where: { id: join.id } })).toMatchObject({ status: 'confirmed' });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'filled' });

    const organizerEvent = `PaymentCompleted:${randomUUID()}`;
    eventIds.push(organizerEvent);
    await handleMatchFeePaymentCompleted(
      organizerEvent,
      paymentPayload(match, { joinId: null, userId: match.organizerUserId, role: 'organizer' }),
      venueClient,
    );
    expect(await prisma.outbox.count({
      where: { aggregateId: match.id, eventType: 'MatchConfirmed' },
    })).toBe(0);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({
      status: 'filled',
      fundingRequestedAt: null,
    });
  });

  it('AC-MMP-06-2: concurrent payments for the last slot confirm one and refund one', async () => {
    const match = await fixture(2);
    const joins = await Promise.all([randomUUID(), randomUUID()].map((participantUserId) =>
      prisma.join.create({
        data: { matchId: match.id, participantUserId, status: 'approved', approvedAt: new Date() },
      })));
    const events = joins.map(() => `PaymentCompleted:${randomUUID()}`);
    eventIds.push(...events);

    await Promise.all(joins.map((join, index) => handleMatchFeePaymentCompleted(
      events[index]!,
      paymentPayload(match, { joinId: join.id, userId: join.participantUserId, role: 'participant' }),
      venueClient,
    )));

    const states = await prisma.join.findMany({ where: { id: { in: joins.map((join) => join.id) } } });
    expect(states.filter((join) => join.status === 'confirmed')).toHaveLength(1);
    expect(states.filter((join) => join.status === 'rejected')).toHaveLength(1);
    const rejected = states.find((join) => join.status === 'rejected')!;
    expect(await prisma.outbox.count({
      where: { aggregateId: rejected.id, eventType: 'MatchFeeRefundRequested' },
    })).toBe(1);
  });

  it('AC-MMP-06-4: BookingConfirmed advances a funded match from filled to confirmed once', async () => {
    const match = await fixture(2);
    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'filled', fundingRequestedAt: new Date() },
    });
    const eventId = `BookingConfirmed:${randomUUID()}`;
    eventIds.push(eventId);
    await handleBookingConfirmedForMatch(eventId, {
      bookingId: match.bookingId,
      businessUserId: randomUUID(),
      gross: '100000',
      venueId: randomUUID(),
      endAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      source: 'marketplace',
    });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'confirmed' });
  });

  it('AC-FIN-05-6: BookingConfirmed advances a filled free match without MatchFunding', async () => {
    const match = await fixture(2);
    await prisma.match.update({
      where: { id: match.id },
      data: { feePerSlot: 0n, status: 'filled', fundingRequestedAt: null },
    });
    const eventId = `BookingConfirmed:${randomUUID()}`;
    eventIds.push(eventId);

    await handleBookingConfirmedForMatch(eventId, {
      bookingId: match.bookingId,
      businessUserId: randomUUID(),
      gross: '100000',
      venueId: randomUUID(),
      endAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      source: 'marketplace',
    });

    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'confirmed' });
  });
});

describe('MMP-07/08 — withdrawal and cancellation', () => {
  it('AC-MMP-07-1/3: pre-cutoff withdrawal on a held booking refunds and reopens a filled match', async () => {
    const match = await fixture(2);
    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'filled', skillMin: 'beginner', skillMax: 'advanced', skillConfiguredAt: new Date() },
    });
    await prisma.outbox.create({
      data: {
        aggregateType: 'Match', aggregateId: match.id, eventType: 'MatchCreated',
        payload: { matchId: match.id, bookingId: match.bookingId },
      },
    });
    const participantUserId = randomUUID();
    const join = await prisma.join.create({
      data: {
        matchId: match.id,
        participantUserId,
        status: 'confirmed',
        approvedAt: new Date(),
        feePaidAt: new Date(),
        paymentContributionId: randomUUID(),
      },
    });

    const result = await withdrawJoin(venueClient, match.id, join.id, participantUserId);

    expect(result).toMatchObject({ status: 'withdrawn', refunded: true });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'open' });
    expect(await prisma.outbox.count({
      where: { aggregateId: join.id, eventType: 'MatchFeeRefundRequested' },
    })).toBe(1);
    const replacement = await requestJoin(match.id, randomUUID());
    expect(replacement.status).toBe('approved');
  });

  // BR-CM-07 thay D32: sau hạn chốt kèo không rút tự do (roster khóa).
  it('BR-CM-07: a new withdrawal from cutoff onward is rejected and the roster stays locked', async () => {
    const match = await fixture(3);
    const cutoff = new Date(Date.now() - 1_000);
    await prisma.match.update({ where: { id: match.id }, data: { cutoffAt: cutoff } });
    const participantUserId = randomUUID();
    const join = await prisma.join.create({
      data: { matchId: match.id, participantUserId, status: 'confirmed', approvedAt: new Date(), feePaidAt: new Date() },
    });

    await expect(withdrawJoin(venueClient, match.id, join.id, participantUserId, new Date()))
      .rejects.toMatchObject({ code: 'JOIN_LOCKED_AT_CUTOFF' });
    expect(await prisma.join.findUniqueOrThrow({ where: { id: join.id } })).toMatchObject({ status: 'confirmed' });
    expect(await prisma.outbox.count({
      where: { aggregateId: join.id, eventType: 'MatchFeeRefundRequested' },
    })).toBe(0);
  });

  it('D36: a confirmed court booking prevents an individual refund', async () => {
    const match = await fixture(2);
    const context = venueClient.contexts.get(match.bookingId)!;
    venueClient.contexts.set(match.bookingId, { ...context, status: 'confirmed' });
    await prisma.match.update({ where: { id: match.id }, data: { status: 'confirmed' } });
    const participantUserId = randomUUID();
    const join = await prisma.join.create({
      data: { matchId: match.id, participantUserId, status: 'confirmed', approvedAt: new Date(), feePaidAt: new Date() },
    });

    const result = await withdrawJoin(venueClient, match.id, join.id, participantUserId);
    expect(result).toMatchObject({ status: 'withdrawn', refunded: false });
  });

  it('AC-MMP-08-1: organizer cancellation refunds paid joins and releases a held booking by event', async () => {
    const match = await fixture(3);
    const joins = await Promise.all([randomUUID(), randomUUID()].map((participantUserId) =>
      prisma.join.create({
        data: { matchId: match.id, participantUserId, status: 'confirmed', approvedAt: new Date(), feePaidAt: new Date() },
      })));

    await cancelMatchByOrganizer(venueClient, match.id, match.organizerUserId, 'Bearer test');

    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'cancelled' });
    const event = await prisma.outbox.findFirstOrThrow({
      where: { aggregateId: match.id, eventType: 'MatchCancelled' },
    });
    expect(event.payload).toMatchObject({ reason: 'organizer', paidJoinIds: expect.arrayContaining(joins.map((join) => join.id)) });
  });

  it('D39: organizer cancellation rebases after a participant withdrawal won the prior venue revision', async () => {
    const match = await fixture(2);
    venueClient.staleCancelOnce.add(match.bookingId);

    await cancelMatchByOrganizer(venueClient, match.id, match.organizerUserId, 'Bearer test');

    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'cancelled' });
    const attempts = await prisma.matchResolution.findMany({
      where: { matchId: match.id, action: 'cancel' }, orderBy: { createdAt: 'asc' },
    });
    expect(attempts.map((attempt) => attempt.decision)).toEqual(['held_revoked', 'cancelled']);
    expect(attempts[1]!.venueRevision).toBe(attempts[0]!.venueRevision + 1);
  });

  it('D33/D39: a retry resumes confirmed-booking policy after Venue committed before Matchmaking crashed', async () => {
    const match = await fixture(2);
    const retryClient = new CrashAfterConfirmedBookingCancelClient();
    const context = venueClient.contexts.get(match.bookingId)!;
    retryClient.contexts.set(match.bookingId, { ...context, status: 'confirmed' });
    await prisma.match.update({ where: { id: match.id }, data: { status: 'confirmed' } });

    await expect(cancelMatchByOrganizer(retryClient, match.id, match.organizerUserId, 'Bearer test'))
      .rejects.toThrow('simulated timeout');
    await cancelMatchByOrganizer(retryClient, match.id, match.organizerUserId, 'Bearer test');

    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'cancelled' });
    const cancellation = await prisma.outbox.findFirstOrThrow({
      where: { aggregateId: match.id, eventType: 'MatchCancelled' }, orderBy: { createdAt: 'desc' },
    });
    expect(cancellation.payload).toMatchObject({ reason: 'confirmed_booking_policy', refundPercent: 50 });
    expect(await prisma.matchResolution.count({ where: { matchId: match.id, action: 'cancel' } })).toBe(1);
  });

  it('AC-MMP-08-2: cutoff sweep cancels an underfilled match', async () => {
    const match = await fixture(3);
    await prisma.match.update({ where: { id: match.id }, data: { cutoffAt: new Date(Date.now() - 1_000) } });

    expect(await cancelMatchesAtCutoff(new Date(), venueClient)).toBeGreaterThanOrEqual(1);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'cancelled' });
    expect(await prisma.outbox.findFirstOrThrow({
      where: { aggregateId: match.id, eventType: 'MatchCancelled' },
    })).toMatchObject({ payload: expect.objectContaining({ reason: 'cutoff' }) });
  });

  it('settles a fully paid match at cutoff instead of cancelling it', async () => {
    const match = await fixture(2);
    const cutoffAt = new Date(Date.now() - 1_000);
    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'filled', organizerContributionPaidAt: new Date(), cutoffAt },
    });
    await prisma.join.create({
      data: {
        matchId: match.id,
        participantUserId: randomUUID(),
        status: 'confirmed',
        approvedAt: new Date(cutoffAt.getTime() - 60_000),
        feePaidAt: new Date(cutoffAt.getTime() - 30_000),
      },
    });

    await cancelMatchesAtCutoff(new Date(), venueClient);

    const fundingEvent = await prisma.outbox.findFirstOrThrow({
      where: { aggregateId: match.id, eventType: 'MatchConfirmed' },
    });
    expect(fundingEvent.payload).toMatchObject({
      participantFees: '50000', organizerContribution: '50000', bookingPrice: '100000',
    });
    expect(await prisma.outbox.count({
      where: { aggregateId: match.id, eventType: 'MatchCancelled' },
    })).toBe(0);
  });

  // D56/BR-CM-21 thay D33: sau hạn chốt kèo chủ kèo không hủy kèo; mọi vấn đề đi qua luồng sự cố.
  it('BR-CM-21: organizer cannot cancel a locked match and is directed to the incident flow', async () => {
    const match = await fixture(2);
    const context = venueClient.contexts.get(match.bookingId)!;
    venueClient.contexts.set(match.bookingId, { ...context, status: 'confirmed' });
    await prisma.match.update({ where: { id: match.id }, data: { status: 'confirmed', fundingRequestedAt: new Date() } });

    await expect(cancelMatchByOrganizer(venueClient, match.id, match.organizerUserId, 'Bearer test'))
      .rejects.toMatchObject({ code: 'MATCH_LOCKED_USE_INCIDENT' });
    expect(await prisma.outbox.count({ where: { aggregateId: match.id, eventType: 'MatchCancelled' } })).toBe(0);
  });
});

describe('Competitive matches v2 — paid-booking cutoff (Task 8)', () => {
  it('emits one MatchConfirmed with the reserve snapshot for a filled paid booking and confirms on MatchFundingCompleted', async () => {
    const { requestMatchFundingAtCutoff } = await import('../src/domain/matchSettlement.js');
    const { handleMatchFundingCompleted } = await import('../src/lib/matchLifecycleEventConsumer.js');
    const bookingId = randomUUID(); const organizerUserId = randomUUID();
    const startAt = new Date(Date.now() + 30 * 3_600_000);
    const match = await prisma.match.create({ data: {
      bookingId, organizerUserId, capacity: 4, feePerSlot: 60000n, status: 'filled', sourceType: 'paid_booking',
      discipline: 'doubles', ratio: 'six_four', mode: 'ranked', bookingPrice: 200001n, startAt, endAt: new Date(startAt.getTime() + 3_600_000),
      organizerContributionPaidAt: new Date(), skillConfiguredAt: new Date(), cutoffAt: new Date(Date.now() - 1_000),
    } });
    matchIds.push(match.id);
    await prisma.join.createMany({ data: (['A', 'B', 'B'] as const).map((teamSide) => ({ matchId: match.id, participantUserId: randomUUID(), status: 'confirmed' as const, teamSide })) });
    venueClient.contexts.set(bookingId, {
      bookingId, ownerUserId: organizerUserId, status: 'confirmed', priceSnapshot: '200001', startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 3_600_000).toISOString(), holdExpiresAt: null,
      court: { id: randomUUID(), name: 'Sân 1' }, venue: { id: randomUUID(), name: 'V', address: 'A', lat: 1, lng: 1 },
      providerUserId: randomUUID(), provinceCode: 'ho-chi-minh',
    });

    expect(await requestMatchFundingAtCutoff(venueClient, match.id, new Date())).toBe(true);
    expect(await requestMatchFundingAtCutoff(venueClient, match.id, new Date())).toBe(true);
    const events = await prisma.outbox.findMany({ where: { aggregateId: match.id, eventType: 'MatchConfirmed' } });
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      sourceType: 'paid_booking', bookingPrice: '200001', resultReserve: '40000', totalContribution: '240001',
      participantFees: '180000', organizerContribution: '60001', participantCount: 3,
    });

    const eventId = `MatchFundingCompleted:${randomUUID()}`; eventIds.push(eventId);
    const payload = { matchId: match.id, bookingId, sourceType: 'paid_booking' as const };
    await handleMatchFundingCompleted(eventId, payload);
    await handleMatchFundingCompleted(eventId, payload);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'confirmed' });
    expect(await prisma.outbox.count({ where: { eventType: 'UserNotificationRequested', aggregateId: { startsWith: `match.confirmed:${match.id}` } } })).toBeGreaterThan(0);
  });
});

describe('Competitive matches v2 — paid-booking match layer closes without touching the booking (Task 9)', () => {
  async function paidMatch(status: 'open' | 'filled', cutoffOffsetMs: number) {
    const bookingId = randomUUID(); const organizerUserId = randomUUID();
    const startAt = new Date(Date.now() + 30 * 3_600_000);
    const match = await prisma.match.create({ data: {
      bookingId, organizerUserId, capacity: 4, feePerSlot: 60000n, status, sourceType: 'paid_booking', discipline: 'doubles',
      ratio: 'six_four', bookingPrice: 200001n, startAt, endAt: new Date(startAt.getTime() + 3_600_000),
      organizerContributionPaidAt: new Date(), skillConfiguredAt: new Date(), cutoffAt: new Date(Date.now() + cutoffOffsetMs),
    } });
    matchIds.push(match.id);
    const join = await prisma.join.create({ data: { matchId: match.id, participantUserId: randomUUID(), status: 'confirmed', teamSide: 'B', feePaidAt: new Date() } });
    venueClient.contexts.set(bookingId, {
      bookingId, ownerUserId: organizerUserId, status: 'confirmed', priceSnapshot: '200001', startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 3_600_000).toISOString(), holdExpiresAt: null,
      court: { id: randomUUID(), name: 'Sân 1' }, venue: { id: randomUUID(), name: 'V', address: 'A', lat: 1, lng: 1 },
      providerUserId: randomUUID(), provinceCode: 'ho-chi-minh',
    });
    return { match, join };
  }
  function countingVenue(bookingId: string) {
    let calls = 0;
    const original = venueClient.resolveMatchBooking.bind(venueClient);
    venueClient.resolveMatchBooking = (...args: Parameters<typeof original>) => { if (args[1] === bookingId) calls += 1; return original(...args); };
    return { calls: () => calls, restore: () => { venueClient.resolveMatchBooking = original; } };
  }

  it('AC-CM-07: an underfilled paid booking at cutoff closes only the match layer and refunds paid participants', async () => {
    const { match, join } = await paidMatch('open', -1_000);
    const spy = countingVenue(match.bookingId);
    try {
      await cancelMatchesAtCutoff(new Date(), venueClient);
      expect(spy.calls()).toBe(0);
    } finally { spy.restore(); }
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'cancelled' });
    const event = await prisma.outbox.findFirstOrThrow({ where: { aggregateId: match.id, eventType: 'MatchCancelled' } });
    expect(event.payload).toMatchObject({ reason: 'cutoff', paidJoinIds: [join.id] });
    expect(venueClient.contexts.get(match.bookingId)!.status).toBe('confirmed');
  });

  it('BR-CM-21: organizer cancels a paid-booking match before cutoff locally and the booking stays confirmed', async () => {
    const { match } = await paidMatch('open', 3_600_000);
    const spy = countingVenue(match.bookingId);
    try {
      await cancelMatchByOrganizer(venueClient, match.id, match.organizerUserId, 'Bearer test');
      expect(spy.calls()).toBe(0);
    } finally { spy.restore(); }
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'cancelled' });
    expect(await prisma.outbox.count({ where: { aggregateId: match.id, eventType: 'MatchCancelled' } })).toBe(1);
  });

  it('BR-CM-07: a paid participant withdraws with a full refund before cutoff and cannot withdraw after it', async () => {
    const before = await paidMatch('filled', 3_600_000);
    const result = await withdrawJoin(venueClient, before.match.id, before.join.id, before.join.participantUserId);
    expect(result).toMatchObject({ status: 'withdrawn', refunded: true });
    expect(await prisma.outbox.count({ where: { aggregateId: before.join.id, eventType: 'MatchFeeRefundRequested' } })).toBe(1);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: before.match.id } })).toMatchObject({ status: 'open' });

    const after = await paidMatch('filled', -1_000);
    await expect(withdrawJoin(venueClient, after.match.id, after.join.id, after.join.participantUserId))
      .rejects.toMatchObject({ code: 'JOIN_LOCKED_AT_CUTOFF' });
  });
});

describe('G2 fix — a late BookingConfirmed does not confirm a paid-booking match', () => {
  it('keeps a filled paid-booking match waiting for MatchFundingCompleted', async () => {
    const bookingId = randomUUID();
    const match = await prisma.match.create({ data: {
      bookingId, organizerUserId: randomUUID(), capacity: 2, feePerSlot: 100000n, status: 'filled', sourceType: 'paid_booking',
      bookingPrice: 200000n, fundingRequestedAt: new Date(), organizerContributionPaidAt: new Date(), cutoffAt: new Date(Date.now() - 1_000),
    } });
    matchIds.push(match.id);
    const eventId = `BookingConfirmed:${randomUUID()}`; eventIds.push(eventId);
    await handleBookingConfirmedForMatch(eventId, {
      bookingId, businessUserId: randomUUID(), gross: '200000', venueId: randomUUID(), endAt: new Date().toISOString(), source: 'marketplace',
    });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({ status: 'filled' });
  });
});
