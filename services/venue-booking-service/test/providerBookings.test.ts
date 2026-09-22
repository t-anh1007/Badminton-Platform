import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createApprovedProvider, createVenueWithCourt, fakeUserId, signTestAccessToken } from './helpers.js';
import { HttpAccountDisplayNameClient } from '../src/clients/account.js';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function createBooking(
  courtId: string,
  patch: Partial<{
    userId: string | null;
    guestName: string | null;
    guestContact: string | null;
    source: 'marketplace' | 'internal';
    status: 'held' | 'confirmed' | 'completed' | 'cancelled';
    startAt: Date;
    endAt: Date;
    cancellationReason: 'self' | 'provider_fault' | 'platform_admin' | null;
  }> = {},
) {
  const startAt = patch.startAt ?? new Date(Date.now() + 3_600_000);
  return prisma.booking.create({
    data: {
      courtId,
      userId: patch.userId === undefined ? fakeUserId() : patch.userId,
      guestName: patch.guestName,
      guestContact: patch.guestContact,
      source: patch.source ?? 'marketplace',
      status: patch.status ?? 'confirmed',
      startAt,
      endAt: patch.endAt ?? new Date(startAt.getTime() + 3_600_000),
      cancellationReason: patch.cancellationReason,
      priceSnapshot: 240000n,
    },
  });
}

describe('provider booking management', () => {
  it('lists meaningful marketplace and internal bookings owned by the provider only', async () => {
    const owner = await createApprovedProvider();
    const other = await createApprovedProvider();
    const own = await createVenueWithCourt(owner.id);
    const foreign = await createVenueWithCourt(other.id);
    const online = await createBooking(own.court.id);
    const walkInStart = new Date(Date.now() + 3 * 3_600_000);
    const walkIn = await createBooking(own.court.id, {
      userId: null,
      source: 'internal',
      guestName: 'Khách tại quầy',
      guestContact: '0900000000',
      startAt: walkInStart,
      endAt: new Date(walkInStart.getTime() + 3_600_000),
    });
    await createBooking(foreign.court.id);
    await createBooking(own.court.id, { status: 'cancelled', cancellationReason: null });

    const response = await request(app)
      .get('/providers/me/bookings')
      .set('Authorization', `Bearer ${signTestAccessToken(owner.userId, ['player', 'provider'])}`);

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => item.id).sort()).toEqual([online.id, walkIn.id].sort());
    expect(response.body.items.find((item: { id: string }) => item.id === walkIn.id).customer)
      .toEqual({ label: 'Khách tại quầy', guestContact: '0900000000' });
  });

  it('does not reveal another provider booking through the detail endpoint', async () => {
    const owner = await createApprovedProvider();
    const other = await createApprovedProvider();
    const foreign = await createVenueWithCourt(other.id);
    const target = await createBooking(foreign.court.id);

    const response = await request(app)
      .get(`/providers/me/bookings/${target.id}`)
      .set('Authorization', `Bearer ${signTestAccessToken(owner.userId, ['player', 'provider'])}`);

    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain(target.id);
  });

  it('filters past, current, and future bookings and returns summary counts', async () => {
    const owner = await createApprovedProvider();
    const { court } = await createVenueWithCourt(owner.id);
    const now = Date.now();
    const past = await createBooking(court.id, {
      status: 'completed',
      startAt: new Date(now - 3 * 3_600_000),
      endAt: new Date(now - 2 * 3_600_000),
    });
    const active = await createBooking(court.id, {
      startAt: new Date(now - 30 * 60_000),
      endAt: new Date(now + 30 * 60_000),
    });
    const upcoming = await createBooking(court.id, {
      startAt: new Date(now + 2 * 3_600_000),
      endAt: new Date(now + 3 * 3_600_000),
    });
    await createBooking(court.id, {
      status: 'cancelled',
      cancellationReason: 'self',
      startAt: new Date(now + 4 * 3_600_000),
      endAt: new Date(now + 5 * 3_600_000),
    });
    const token = signTestAccessToken(owner.userId, ['player', 'provider']);

    const [pastResponse, currentResponse, futureResponse, allResponse] = await Promise.all([
      request(app).get('/providers/me/bookings?timeScope=past').set('Authorization', `Bearer ${token}`),
      request(app).get('/providers/me/bookings?timeScope=current').set('Authorization', `Bearer ${token}`),
      request(app).get('/providers/me/bookings?timeScope=future').set('Authorization', `Bearer ${token}`),
      request(app).get('/providers/me/bookings').set('Authorization', `Bearer ${token}`),
    ]);

    expect(pastResponse.body.items.map((item: { id: string }) => item.id)).toEqual([past.id]);
    expect(currentResponse.body.items.map((item: { id: string }) => item.id)).toEqual([active.id]);
    expect(futureResponse.body.items.map((item: { id: string }) => item.id)).toEqual([upcoming.id]);
    expect(allResponse.body.summary).toEqual({ all: 4, completed: 1, current: 1, future: 1 });
  });

  it('applies status, venue, court, keyword, date, and pagination filters', async () => {
    const owner = await createApprovedProvider();
    const first = await createVenueWithCourt(owner.id);
    const second = await createVenueWithCourt(owner.id);
    const startAt = new Date('2026-09-22T02:00:00.000Z');
    const matching = await createBooking(first.court.id, {
      userId: null,
      source: 'internal',
      guestName: 'Khách lọc',
      status: 'completed',
      startAt,
      endAt: new Date('2026-09-22T03:00:00.000Z'),
    });
    await createBooking(second.court.id, {
      status: 'confirmed',
      startAt: new Date('2026-09-23T02:00:00.000Z'),
      endAt: new Date('2026-09-23T03:00:00.000Z'),
    });

    const response = await request(app)
      .get('/providers/me/bookings')
      .query({
        query: 'Khách lọc',
        venueId: first.venue.id,
        courtId: first.court.id,
        status: 'completed',
        from: '2026-09-22',
        to: '2026-09-22',
        page: 1,
        pageSize: 1,
      })
      .set('Authorization', `Bearer ${signTestAccessToken(owner.userId, ['player', 'provider'])}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([matching.id]);
  });

  it('includes paid match holds and enriches marketplace display names without exposing contact', async () => {
    const owner = await createApprovedProvider();
    const { court } = await createVenueWithCourt(owner.id);
    const playerId = fakeUserId();
    const startAt = new Date(Date.now() + 6 * 3_600_000);
    const hold = await prisma.hold.create({
      data: {
        courtId: court.id,
        userId: playerId,
        startAt,
        endAt: new Date(startAt.getTime() + 3_600_000),
        expiresAt: new Date(Date.now() + 10 * 60_000),
        purpose: 'match',
      },
    });
    const held = await prisma.booking.create({
      data: {
        holdId: hold.id,
        courtId: court.id,
        userId: playerId,
        source: 'marketplace',
        status: 'held',
        startAt: hold.startAt,
        endAt: hold.endAt,
        holdExpiresAt: hold.expiresAt,
        priceSnapshot: 240000n,
      },
    });
    vi.spyOn(HttpAccountDisplayNameClient.prototype, 'getPublicDisplayNames')
      .mockResolvedValue([{ userId: playerId, displayName: 'Người chơi công khai' }]);

    const response = await request(app)
      .get('/providers/me/bookings')
      .set('Authorization', `Bearer ${signTestAccessToken(owner.userId, ['player', 'provider'])}`);

    expect(response.body.items).toEqual([
      expect.objectContaining({
        id: held.id,
        matchDepositPaid: true,
        customer: { label: 'Người chơi công khai' },
      }),
    ]);
  });

  it('keeps the list available with a fallback label when account enrichment fails', async () => {
    const owner = await createApprovedProvider();
    const { court } = await createVenueWithCourt(owner.id);
    await createBooking(court.id);
    vi.spyOn(HttpAccountDisplayNameClient.prototype, 'getPublicDisplayNames')
      .mockRejectedValue(new Error('account unavailable'));

    const response = await request(app)
      .get('/providers/me/bookings')
      .set('Authorization', `Bearer ${signTestAccessToken(owner.userId, ['player', 'provider'])}`);

    expect(response.status).toBe(200);
    expect(response.body.items[0].customer).toEqual({ label: 'Người chơi' });
    expect(typeof response.body.items[0].priceSnapshot).toBe('string');
  });
});
