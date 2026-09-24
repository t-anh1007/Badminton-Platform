import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma as venuePrisma } from '../../venue-booking-service/src/lib/prisma.js';
import { CANCELLATION_POLICY } from '../../venue-booking-service/src/domain/cancellationPolicy.js';
import {
  confirmOperationalShutdown,
  previewOperationalShutdown,
  recordShutdownRefundCompleted,
} from '../../venue-booking-service/src/domain/operationalShutdown.js';
import { prisma as financePrisma } from '../../finance-service/src/lib/prisma.js';
import {
  getOrganizerContribution,
  handleJoinApproved,
  handleMatchCancelled,
  handleMatchCreated,
  payMatchContributionWithBalance,
} from '../../finance-service/src/domain/matchFee.js';
import { seedPersonalBalance } from '../../finance-service/test/helpers.js';
import type { MatchCancelledPayload } from '@khoaluantn/shared';
import { prisma as matchmakingPrisma } from '../src/lib/prisma.js';
import { handleShutdownBookingCancellation } from '../src/lib/matchLifecycleEventConsumer.js';

const eventIds = {
  venueRefundCompleted: '',
  matchmakingShutdown: '',
  finance: [] as string[],
};
const shutdownOutboxIds: string[] = [];
const ids = {
  providerId: '',
  venueId: '',
  courtId: '',
  bookingId: '',
  shutdownId: '',
  matchId: '',
  organizerUserId: '',
  participantUserId: '',
  joinId: '',
};

afterAll(async () => {
  try {
    if (eventIds.venueRefundCompleted) {
      await venuePrisma.processedEvent.deleteMany({ where: { eventId: eventIds.venueRefundCompleted } });
    }
    if (ids.shutdownId) {
      await venuePrisma.operationalShutdownTransition.deleteMany({ where: { shutdownId: ids.shutdownId } });
      await venuePrisma.operationalShutdownItem.deleteMany({ where: { shutdownId: ids.shutdownId } });
      await venuePrisma.operationalShutdown.deleteMany({ where: { id: ids.shutdownId } });
    }
    if (ids.bookingId) {
      await venuePrisma.outbox.deleteMany({ where: { aggregateId: { in: [ids.bookingId, `booking.shutdown_emergency:${ids.bookingId}`] } } });
      await venuePrisma.booking.deleteMany({ where: { id: ids.bookingId } });
    }
    if (ids.courtId) await venuePrisma.court.deleteMany({ where: { id: ids.courtId } });
    if (ids.venueId) await venuePrisma.venue.deleteMany({ where: { id: ids.venueId } });
    if (ids.providerId) await venuePrisma.provider.deleteMany({ where: { id: ids.providerId } });

    if (eventIds.matchmakingShutdown) {
      await matchmakingPrisma.processedEvent.deleteMany({ where: { eventId: eventIds.matchmakingShutdown } });
    }
    if (ids.matchId) {
      await matchmakingPrisma.outbox.deleteMany({ where: { aggregateId: ids.matchId } });
      await matchmakingPrisma.join.deleteMany({ where: { matchId: ids.matchId } });
      await matchmakingPrisma.match.deleteMany({ where: { id: ids.matchId } });
    }
    if (shutdownOutboxIds.length) {
      await matchmakingPrisma.outbox.deleteMany({ where: { aggregateId: { in: shutdownOutboxIds } } });
      await financePrisma.outbox.deleteMany({ where: { aggregateId: { in: shutdownOutboxIds } } });
    }

    if (eventIds.finance.length) await financePrisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds.finance } } });
    if (ids.matchId) {
      const contributions = await financePrisma.matchContribution.findMany({ where: { matchId: ids.matchId }, select: { id: true } });
      const contributionIds = contributions.map((item) => item.id);
      const walletIds = (await financePrisma.wallet.findMany({
        where: { userId: { in: [ids.organizerUserId, ids.participantUserId].filter((id): id is string => !!id) } },
        select: { id: true },
      })).map((wallet) => wallet.id);
      await financePrisma.outbox.deleteMany({ where: { aggregateId: { in: [ids.matchId, ...(ids.bookingId ? [ids.bookingId] : []), ...contributionIds] } } });
      await financePrisma.ledgerEntry.deleteMany({ where: { OR: [
        { walletId: { in: walletIds } }, { refId: { in: contributionIds } },
      ] } });
      await financePrisma.paymentIntent.deleteMany({ where: { refId: { in: contributionIds } } });
      await financePrisma.matchContribution.deleteMany({ where: { matchId: ids.matchId } });
      await financePrisma.matchFunding.deleteMany({ where: { matchId: ids.matchId } });
      await financePrisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
    }
  } finally {
    await Promise.all([venuePrisma.$disconnect(), financePrisma.$disconnect(), matchmakingPrisma.$disconnect()]);
  }
});

describe('operational shutdown cross-service lifecycle', () => {
  it('cancels a match booking and returns every paid contribution with the matching booking code', async () => {
    ids.organizerUserId = randomUUID();
    ids.participantUserId = randomUUID();
    ids.providerId = randomUUID();
    ids.bookingId = randomUUID();
    ids.matchId = randomUUID();
    ids.joinId = randomUUID();
    const businessUserId = ids.organizerUserId;
    const price = 200000n;
    const contributionAmount = 100000n;
    const startAt = new Date(Date.now() + 3 * 60 * 60_000);
    const endAt = new Date(startAt.getTime() + 60 * 60_000);

    await venuePrisma.provider.create({ data: {
      id: ids.providerId, userId: businessUserId, orgName: 'Shutdown integration provider', status: 'approved',
    } });
    const venue = await venuePrisma.venue.create({ data: {
      providerId: ids.providerId, name: 'Shutdown integration venue', address: 'Test address', lat: 10, lng: 106,
    } });
    ids.venueId = venue.id;
    const court = await venuePrisma.court.create({ data: { venueId: venue.id, name: 'Sân thử', active: true } });
    ids.courtId = court.id;
    const booking = await venuePrisma.booking.create({ data: {
      id: ids.bookingId,
      courtId: court.id,
      startAt,
      endAt,
      userId: ids.organizerUserId,
      source: 'marketplace',
      status: 'held',
      holdPurposeSnapshot: 'match',
      holdExpiresAt: new Date(Date.now() + 10 * 60_000),
      priceSnapshot: price,
      policySnapshot: CANCELLATION_POLICY,
    } });

    const match = await matchmakingPrisma.match.create({ data: {
      id: ids.matchId,
      organizerUserId: ids.organizerUserId,
      bookingId: booking.id,
      capacity: 2,
      feePerSlot: contributionAmount,
      cutoffAt: new Date(Date.now() + 2 * 60 * 60_000),
      deadlineAt: new Date(Date.now() + 2 * 60 * 60_000),
      organizerContributionPaidAt: new Date(),
      status: 'filled',
    } });
    await matchmakingPrisma.join.create({ data: {
      id: ids.joinId,
      matchId: match.id,
      participantUserId: ids.participantUserId,
      status: 'approved',
    } });

    const matchCreatedEventId = `MatchCreated:${randomUUID()}`;
    const joinApprovedEventId = `JoinApproved:${randomUUID()}`;
    eventIds.finance.push(matchCreatedEventId, joinApprovedEventId);
    await handleMatchCreated(matchCreatedEventId, {
      matchId: match.id,
      bookingId: booking.id,
      organizerUserId: ids.organizerUserId,
      capacity: 2,
      feePerSlot: contributionAmount.toString(),
      bookingPrice: price.toString(),
      organizerContribution: contributionAmount.toString(),
      cutoffAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
    });
    await handleJoinApproved(joinApprovedEventId, {
      matchId: match.id,
      joinId: ids.joinId,
      participantUserId: ids.participantUserId,
      fee: contributionAmount.toString(),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    const organizerContribution = await getOrganizerContribution(match.id);
    const participantContribution = await financePrisma.matchContribution.findUniqueOrThrow({ where: { joinId: ids.joinId } });
    await seedPersonalBalance(ids.organizerUserId, contributionAmount);
    await seedPersonalBalance(ids.participantUserId, contributionAmount);
    await payMatchContributionWithBalance(ids.organizerUserId, organizerContribution.id);
    await payMatchContributionWithBalance(ids.participantUserId, participantContribution.id);
    await matchmakingPrisma.join.update({ where: { id: ids.joinId }, data: { feePaidAt: new Date() } });

    const shutdownInput = { mode: 'emergency' as const, reason: 'Sự cố sân trong thời gian chơi' };
    const actor = { userId: ids.organizerUserId, roles: ['player'] };
    const preview = await previewOperationalShutdown(actor, { type: 'court', id: court.id }, shutdownInput, {
      getPaidAmounts: async (bookingIds) => Object.fromEntries(bookingIds.map((bookingId) => [bookingId, '200000'])),
    });
    expect(preview).toMatchObject({ affectedMatch: 1, affectedMarketplace: 0 });
    const confirmed = await confirmOperationalShutdown(
      actor, { type: 'court', id: court.id }, shutdownInput, preview.previewToken,
    );
    ids.shutdownId = confirmed.shutdown.id;

    const shutdownRequest = await venuePrisma.outbox.findFirstOrThrow({
      where: { aggregateId: booking.id, eventType: 'ShutdownBookingCancellationRequested' },
    });
    eventIds.matchmakingShutdown = `ShutdownBookingCancellationRequested:${randomUUID()}`;
    shutdownOutboxIds.push(`match.shutdown_emergency:${match.id}:${ids.organizerUserId}`,
      `match.shutdown_emergency:${match.id}:${ids.participantUserId}`,
      `shutdown.refund:${organizerContribution.id}`, `shutdown.refund:${participantContribution.id}`);
    await handleShutdownBookingCancellation(eventIds.matchmakingShutdown, shutdownRequest.payload);
    const matchCancelled = await matchmakingPrisma.outbox.findFirstOrThrow({
      where: { aggregateId: match.id, eventType: 'MatchCancelled' },
    });
    const financeMatchCancelledEventId = `MatchCancelled:${randomUUID()}`;
    eventIds.finance.push(financeMatchCancelledEventId);
    await handleMatchCancelled(financeMatchCancelledEventId, matchCancelled.payload as MatchCancelledPayload);

    const completion = await financePrisma.outbox.findFirstOrThrow({
      where: { aggregateType: 'Booking', aggregateId: booking.id, eventType: 'BookingRefundCompleted' },
    });
    eventIds.venueRefundCompleted = `BookingRefundCompleted:${completion.id}`;
    await recordShutdownRefundCompleted(eventIds.venueRefundCompleted, completion.payload as { bookingId: string; shutdownId: string });

    expect((await matchmakingPrisma.match.findUniqueOrThrow({ where: { id: match.id } })).status).toBe('cancelled');
    expect((await matchmakingPrisma.join.findUniqueOrThrow({ where: { id: ids.joinId } })).status).toBe('withdrawn');
    expect(await financePrisma.matchFunding.findUniqueOrThrow({ where: { matchId: match.id } })).toMatchObject({ status: 'cancelled' });
    expect(await financePrisma.matchContribution.count({ where: { matchId: match.id, status: 'refunded' } })).toBe(2);
    expect((await financePrisma.wallet.findFirstOrThrow({ where: { userId: ids.organizerUserId, walletType: 'personal' } })).available)
      .toBe(contributionAmount);
    expect((await financePrisma.wallet.findFirstOrThrow({ where: { userId: ids.participantUserId, walletType: 'personal' } })).available)
      .toBe(contributionAmount);
    expect((await venuePrisma.operationalShutdownItem.findFirstOrThrow({ where: { shutdownId: confirmed.shutdown.id } })).status)
      .toBe('refunded');
    const refundNotifications = await financePrisma.outbox.findMany({
      where: { aggregateId: { in: [`shutdown.refund:${organizerContribution.id}`, `shutdown.refund:${participantContribution.id}`] },
        eventType: 'UserNotificationRequested' },
    });
    expect(refundNotifications).toHaveLength(2);
    expect(refundNotifications.map((item) => (item.payload as { bookingBusinessCode: string }).bookingBusinessCode))
      .toEqual([booking.businessCode, booking.businessCode]);
  });
});
