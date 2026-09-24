import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import {
  confirmOperationalShutdown,
  previewOperationalShutdown,
  processOperationalShutdownItems,
  recordShutdownRefundCompleted,
  retryPendingShutdownRefunds,
  refreshOperationalShutdownStatus,
  refreshOperationalShutdownStatuses,
} from '../src/domain/operationalShutdown.js';
import { scheduledCloseInstant } from '../src/domain/operationalShutdownPolicy.js';
import { CANCELLATION_POLICY } from '../src/domain/cancellationPolicy.js';
import { createApprovedProvider, createVenueWithCourt, fakeUserId } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

async function createBookingFixture(startAt: Date, endAt: Date) {
  const playerId = fakeUserId();
  const providerUserId = fakeUserId();
  const provider = await createApprovedProvider(providerUserId);
  const { venue, court } = await createVenueWithCourt(provider.id);
  const booking = await prisma.booking.create({
    data: {
      courtId: court.id,
      startAt,
      endAt,
      userId: playerId,
      source: 'marketplace',
      status: 'confirmed',
      priceSnapshot: 250000n,
      policySnapshot: CANCELLATION_POLICY,
    },
  });
  return { providerUserId, actor: { userId: providerUserId, roles: ['provider'] }, venue, court, booking };
}

async function createExpiredHeldFixture(holdPurposeSnapshot: 'checkout' | 'match') {
  const providerUserId = fakeUserId();
  const provider = await createApprovedProvider(providerUserId);
  const { court } = await createVenueWithCourt(provider.id);
  const startAt = new Date(Date.now() + 30 * 60_000);
  const booking = await prisma.booking.create({
    data: {
      holdId: fakeUserId(),
      holdPurposeSnapshot,
      courtId: court.id,
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60_000),
      holdExpiresAt: new Date(Date.now() - 60_000),
      userId: fakeUserId(),
      source: 'marketplace',
      status: 'held',
      priceSnapshot: 250000n,
      policySnapshot: CANCELLATION_POLICY,
    },
  });
  return { providerUserId, actor: { userId: providerUserId, roles: ['provider'] }, court, booking };
}

async function createIdentifiedShutdownItem(providerUserId: string, courtId: string, bookingId: string) {
  const now = new Date();
  const shutdown = await prisma.operationalShutdown.create({
    data: {
      scopeType: 'court', scopeId: courtId, mode: 'emergency', modeStartedAt: now,
      operationalStatus: 'inactive', resolutionStatus: 'processing', effectiveAt: now,
      expectedInactiveAt: now, createdByUserId: providerUserId, originallyActiveCourtIds: [courtId],
    },
  });
  await prisma.operationalShutdownItem.create({
    data: { shutdownId: shutdown.id, bookingId, mode: 'emergency', effectiveAt: now },
  });
  return shutdown;
}

const noPaidAmounts = {
  getPaidAmounts: async (bookingIds: string[]) => Object.fromEntries(bookingIds.map((id) => [id, '0'])),
};

describe('operational shutdown', () => {
  it('closes after all active bookings end and ignores already-ended bookings', async () => {
    const now = new Date();
    const ended = new Date(now.getTime() - 60_000);
    const { providerUserId, court, booking } = await createBookingFixture(
      new Date(ended.getTime() - 3_600_000), ended,
    );
    const actor = { userId: providerUserId, roles: ['provider'] };
    const preview = await previewOperationalShutdown(actor, { type: 'court', id: court.id }, { mode: 'winding_down' });
    await confirmOperationalShutdown(
      actor, { type: 'court', id: court.id }, { mode: 'winding_down' }, preview.previewToken,
    );

    await refreshOperationalShutdownStatuses(new Date());

    const shutdown = await prisma.operationalShutdown.findFirstOrThrow({ where: { scopeId: court.id, endedAt: null } });
    expect(shutdown.operationalStatus).toBe('inactive');
    expect(shutdown.expectedInactiveAt).not.toBeNull();
    expect(await prisma.court.findUniqueOrThrow({ where: { id: court.id } })).toMatchObject({ active: false });
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: 'confirmed' });
  });

  it('keeps a later scheduled close active when refreshing the same shutdown', async () => {
    const fixture = await createBookingFixture(
      new Date(Date.now() + 48 * 60 * 60_000),
      new Date(Date.now() + 49 * 60 * 60_000),
    );
    const winding = { mode: 'winding_down' as const };
    const first = await previewOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, winding);
    const created = await confirmOperationalShutdown(
      fixture.actor, { type: 'court', id: fixture.court.id }, winding, first.previewToken,
    );
    const closeDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const scheduled = { mode: 'scheduled_close' as const, closeDate };
    const second = await previewOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, scheduled);
    await confirmOperationalShutdown(
      fixture.actor, { type: 'court', id: fixture.court.id }, scheduled, second.previewToken,
    );

    await refreshOperationalShutdownStatus(created.shutdown.id, new Date());

    expect(await prisma.operationalShutdown.findUniqueOrThrow({ where: { id: created.shutdown.id } }))
      .toMatchObject({ mode: 'scheduled_close', operationalStatus: 'scheduled_close' });
    expect((await prisma.court.findUniqueOrThrow({ where: { id: fixture.court.id } })).active).toBe(true);
  });

  it('creates one cancellation obligation when venue and child court shutdown confirmations overlap', async () => {
    const fixture = await createBookingFixture(
      new Date(Date.now() + 2 * 60 * 60_000),
      new Date(Date.now() + 3 * 60 * 60_000),
    );
    const input = { mode: 'emergency' as const, reason: 'Sự cố vận hành' };
    const [venuePreview, courtPreview] = await Promise.all([
      previewOperationalShutdown(fixture.actor, { type: 'venue', id: fixture.venue.id }, input),
      previewOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, input),
    ]);

    const results = await Promise.allSettled([
      confirmOperationalShutdown(fixture.actor, { type: 'venue', id: fixture.venue.id }, input, venuePreview.previewToken),
      confirmOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, input, courtPreview.previewToken),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    await processOperationalShutdownItems(25);

    expect(await prisma.operationalShutdownItem.count({ where: { bookingId: fixture.booking.id } })).toBe(1);
    expect(await prisma.outbox.count({ where: { aggregateId: fixture.booking.id, eventType: 'BookingCancelled' } })).toBe(1);
    expect(await prisma.operationalShutdownItem.count({ where: { bookingId: fixture.booking.id, status: 'needs_attention' } })).toBe(0);
  });

  it('allows Admin shutdown takeover and rejects an unrelated player', async () => {
    const fixture = await createBookingFixture(
      new Date(Date.now() + 2 * 60 * 60_000),
      new Date(Date.now() + 3 * 60 * 60_000),
    );
    const admin = { userId: fakeUserId(), roles: ['player', 'admin'] };
    const outsider = { userId: fakeUserId(), roles: ['player'] };
    const input = { mode: 'emergency' as const, reason: 'Cơ sở không thể tiếp tục phục vụ' };

    await expect(previewOperationalShutdown(outsider, { type: 'court', id: fixture.court.id }, input))
      .rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
    await expect(previewOperationalShutdown(admin, { type: 'court', id: fixture.court.id }, input))
      .resolves.toMatchObject({ affectedMarketplace: 1 });
  });

  it('includes paid money from held checkout bookings in the refund estimate and fails closed if Finance is unavailable', async () => {
    const fixture = await createExpiredHeldFixture('checkout');
    const confirmedStart = new Date(Date.now() + 3 * 60 * 60_000);
    await prisma.booking.create({
      data: {
        courtId: fixture.court.id, startAt: confirmedStart, endAt: new Date(confirmedStart.getTime() + 60 * 60_000),
        userId: fakeUserId(), source: 'marketplace', status: 'confirmed', priceSnapshot: 250000n,
        policySnapshot: CANCELLATION_POLICY,
      },
    });
    const input = { mode: 'emergency' as const, reason: 'Sự cố vận hành' };
    const finance = { getPaidAmounts: async (bookingIds: string[]) => ({ [bookingIds[0]!]: '75000' }) };
    const preview = await previewOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, input, finance);

    expect(preview.estimatedRefund).toBe('325000');
    expect(preview.estimatedRefundExcludesUnsettledMatches).toBe(false);
    await expect(previewOperationalShutdown(fixture.actor, { type: 'court', id: fixture.court.id }, input, {
      getPaidAmounts: async () => { throw new Error('Finance unavailable'); },
    })).rejects.toMatchObject({ message: 'Chưa thể tính tổng tiền hoàn. Vui lòng thử lại.' });
  });

  it.each(['refund-before-cancellation', 'refund-after-cancellation'] as const)(
    'projects a late-payment return correctly when refund completes %s',
    async (order) => {
      const fixture = await createExpiredHeldFixture('checkout');
      const shutdown = await createIdentifiedShutdownItem(fixture.providerUserId, fixture.court.id, fixture.booking.id);
      const eventId = fakeUserId();

      if (order === 'refund-before-cancellation') {
        await recordShutdownRefundCompleted(eventId, { bookingId: fixture.booking.id, shutdownId: shutdown.id });
        await processOperationalShutdownItems(25, shutdown.id);
      } else {
        await processOperationalShutdownItems(25, shutdown.id);
        await recordShutdownRefundCompleted(eventId, { bookingId: fixture.booking.id, shutdownId: shutdown.id });
      }

      expect(await prisma.booking.findUniqueOrThrow({ where: { id: fixture.booking.id } })).toMatchObject({ status: 'cancelled' });
      expect(await prisma.operationalShutdownItem.findFirstOrThrow({ where: { bookingId: fixture.booking.id } }))
        .toMatchObject({ status: 'refunded', refundCompletedAt: expect.any(Date) });
    },
  );

  it('scheduled closure cancels bookings that extend past Vietnam midnight and queues full refunds', async () => {
    const closeDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const cutoff = scheduledCloseInstant(closeDate);
    const { providerUserId, court, booking } = await createBookingFixture(
      new Date(cutoff.getTime() + 30 * 60_000), new Date(cutoff.getTime() + 90 * 60_000),
    );
    const input = { mode: 'scheduled_close' as const, closeDate };
    const actor = { userId: providerUserId, roles: ['provider'] };
    const preview = await previewOperationalShutdown(actor, { type: 'court', id: court.id }, input, noPaidAmounts);
    expect(preview.affectedMarketplace).toBe(1);

    await confirmOperationalShutdown(actor, { type: 'court', id: court.id }, input, preview.previewToken);

    const cancelled = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    const refund = await prisma.outbox.findFirstOrThrow({ where: { aggregateId: booking.id, eventType: 'BookingCancelled' } });
    const notification = await prisma.outbox.findFirstOrThrow({
      where: { aggregateId: `booking.shutdown_scheduled:${booking.id}`, eventType: 'UserNotificationRequested' },
    });
    expect(cancelled).toMatchObject({ status: 'cancelled', cancellationRefundPercent: 100 });
    expect(refund.payload).toMatchObject({ bookingId: booking.id, gross: '250000', refundPercent: 100, bookingBusinessCode: booking.businessCode });
    expect(notification.payload).toMatchObject({ bookingBusinessCode: booking.businessCode, deliveryPolicy: 'required' });
  });

  it('emergency closure cancels an in-progress booking and records its exact business code', async () => {
    const now = Date.now();
    const startAt = new Date(now - 30 * 60_000);
    const endAt = new Date(now + 30 * 60_000);
    const { providerUserId, court, booking } = await createBookingFixture(startAt, endAt);
    const input = { mode: 'emergency' as const, reason: 'Trục trặc hệ thống chiếu sáng' };
    const actor = { userId: providerUserId, roles: ['provider'] };
    const preview = await previewOperationalShutdown(actor, { type: 'court', id: court.id }, input, noPaidAmounts);
    expect(preview.affectedMarketplace).toBe(1);

    await confirmOperationalShutdown(actor, { type: 'court', id: court.id }, input, preview.previewToken);

    const cancelled = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    const notification = await prisma.outbox.findFirstOrThrow({
      where: { aggregateId: `booking.shutdown_emergency:${booking.id}`, eventType: 'UserNotificationRequested' },
    });
    expect(cancelled).toMatchObject({
      status: 'cancelled', cancellationReason: 'provider_fault', cancellationRefundPercent: 100,
    });
    expect(notification.payload).toMatchObject({ bookingBusinessCode: booking.businessCode, deliveryPolicy: 'required' });
  });

  it('retries a refund with the same BookingCancelled payload and cancellation note', async () => {
    const startAt = new Date(Date.now() + 2 * 60 * 60_000);
    const { providerUserId, court, booking } = await createBookingFixture(startAt, new Date(startAt.getTime() + 60 * 60_000));
    const actor = { userId: providerUserId, roles: ['provider'] };
    const input = { mode: 'emergency' as const, reason: 'Mất điện tại cơ sở' };
    const preview = await previewOperationalShutdown(actor, { type: 'court', id: court.id }, input);
    await confirmOperationalShutdown(actor, { type: 'court', id: court.id }, input, preview.previewToken);
    await retryPendingShutdownRefunds(new Date(Date.now() + 2 * 60_000));

    const events = await prisma.outbox.findMany({
      where: { aggregateId: booking.id, eventType: 'BookingCancelled' }, orderBy: { createdAt: 'asc' },
    });
    expect(events).toHaveLength(2);
    expect(events[1]!.payload).toEqual(events[0]!.payload);
    expect(events[0]!.payload).toMatchObject({ cancellationNote: 'Ngừng hoạt động do sự cố', shutdownId: expect.any(String) });
  });

  it('does not mistake an expired checkout whose Hold row was reaped for a match refund', async () => {
    const { providerUserId, court, booking } = await createExpiredHeldFixture('checkout');
    const input = { mode: 'emergency' as const, reason: 'Sự cố vận hành' };
    const actor = { userId: providerUserId, roles: ['provider'] };
    const preview = await previewOperationalShutdown(actor, { type: 'court', id: court.id }, input, noPaidAmounts);

    await confirmOperationalShutdown(actor, { type: 'court', id: court.id }, input, preview.previewToken);

    const item = await prisma.operationalShutdownItem.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(item).toMatchObject({ status: 'cancelled_unpaid', refundPath: 'none' });
  });

  it('retains match refund processing when an expired match Hold row was reaped', async () => {
    const { providerUserId, court, booking } = await createExpiredHeldFixture('match');
    const input = { mode: 'emergency' as const, reason: 'Sự cố vận hành' };
    const actor = { userId: providerUserId, roles: ['provider'] };
    const preview = await previewOperationalShutdown(actor, { type: 'court', id: court.id }, input, noPaidAmounts);
    expect(preview.affectedMatch).toBe(1);
    expect(preview.affectedMarketplace).toBe(0);

    await confirmOperationalShutdown(actor, { type: 'court', id: court.id }, input, preview.previewToken);

    const item = await prisma.operationalShutdownItem.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(item).toMatchObject({ status: 'cancelled_refund_processing', refundPath: 'match' });
    expect(await prisma.outbox.findFirst({
      where: { aggregateId: booking.id, eventType: 'ShutdownBookingCancellationRequested' },
    })).not.toBeNull();
  });
});
