import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { releaseHeldMatchBooking, resolveMatchBooking } from '../src/domain/booking.js';
import { signTestAccessToken } from './helpers.js';

const app = createApp();
const providerIds: string[] = [];
const eventIds: string[] = [];
const bookingIds: string[] = [];

afterAll(async () => {
  await prisma.matchBookingCommand.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.booking.deleteMany({ where: { court: { venue: { providerId: { in: providerIds } } } } });
  await prisma.hold.deleteMany({ where: { court: { venue: { providerId: { in: providerIds } } } } });
  await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.court.deleteMany({ where: { venue: { providerId: { in: providerIds } } } });
  await prisma.venue.deleteMany({ where: { providerId: { in: providerIds } } });
  await prisma.provider.deleteMany({ where: { id: { in: providerIds } } });
  await prisma.$disconnect();
});

describe('matchmaking booking context contract', () => {
  it('BR-CM-01: lists owned holds and already-paid future bookings as match sources without mutating them', async () => {
    const ownerId = randomUUID(); const otherId = randomUUID(); const providerId = randomUUID(); const providerUserId = randomUUID();
    providerIds.push(providerId);
    const court = await prisma.court.create({ data: { name: 'Sân 03', venue: { create: {
      name: 'Nhà thi đấu Quận 7', address: '12 Nguyễn Thị Thập, Quận 7', provinceCode: 'ho-chi-minh', lat: 10.73, lng: 106.72,
      provider: { create: { id: providerId, userId: providerUserId, orgName: 'Q7' } },
    } } } });
    const at = (hours: number) => new Date(Date.now() + hours * 3_600_000);
    const booking = (data: Record<string, unknown>) => prisma.booking.create({ data: {
      courtId: court.id, userId: ownerId, source: 'marketplace', status: 'confirmed', priceSnapshot: 200001n,
      startAt: at(48), endAt: at(49), ...data,
    } as never }).then((row) => { bookingIds.push(row.id); return row; });
    const paid = await booking({});
    await booking({ userId: otherId, startAt: at(50), endAt: at(51) });
    await booking({ status: 'completed', startAt: at(52), endAt: at(53) });
    await booking({ status: 'cancelled', startAt: at(54), endAt: at(55) });
    await booking({ source: 'internal', userId: null, startAt: at(56), endAt: at(57) });
    await booking({ holdPurposeSnapshot: 'match', startAt: at(58), endAt: at(59) });
    await booking({ startAt: at(-3), endAt: at(-2) });
    const hold = await prisma.hold.create({ data: { courtId: court.id, userId: ownerId, startAt: at(72), endAt: at(73), expiresAt: at(0.2) } });
    // Chỉ đếm outbox của nguồn trong test này; test file khác chạy song song cũng ghi outbox.
    const since = new Date();

    const response = await request(app).get('/players/me/match-sources').set('Authorization', `Bearer ${signTestAccessToken(ownerId, ['player'])}`).expect(200);

    expect(response.body.sources).toEqual([
      expect.objectContaining({ sourceType: 'hold', holdId: hold.id, bookingStatus: 'held', price: '0' }),
      {
        sourceType: 'paid_booking', bookingId: paid.id, bookingStatus: 'confirmed', price: '200001',
        startAt: paid.startAt.toISOString(), endAt: paid.endAt.toISOString(),
        venue: { id: court.venueId, name: 'Nhà thi đấu Quận 7', address: '12 Nguyễn Thị Thập, Quận 7', provinceCode: 'ho-chi-minh' },
        court: { id: court.id, name: 'Sân 03' },
      },
    ]);
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: paid.id } })).toMatchObject({ status: 'confirmed' });
    expect(await prisma.outbox.count({ where: { createdAt: { gte: since }, aggregateId: { in: [...bookingIds, hold.id] } } })).toBe(0);
    await prisma.hold.delete({ where: { id: hold.id } });
  });

  it('snapshots the provider identity and venue province in single and batch match context', async () => {
    const providerId = randomUUID(); const providerUserId = randomUUID(); providerIds.push(providerId);
    const booking = await prisma.booking.create({ data: {
      userId: randomUUID(), source: 'marketplace', status: 'confirmed', priceSnapshot: 150000n,
      startAt: new Date(Date.now() + 30 * 3_600_000), endAt: new Date(Date.now() + 31 * 3_600_000),
      court: { create: { name: 'Sân 1', venue: { create: { name: 'V tỉnh', address: 'Đà Nẵng', provinceCode: 'da-nang', lat: 16, lng: 108,
        provider: { create: { id: providerId, userId: providerUserId, orgName: 'P' } } } } } },
    } });
    bookingIds.push(booking.id);
    const single = await request(app).get(`/internal/bookings/${booking.id}/match-context`).expect(200);
    expect(single.body).toMatchObject({ providerUserId, provinceCode: 'da-nang' });
    const batch = await request(app).post('/internal/bookings/match-contexts').send({ bookingIds: [booking.id] }).expect(200);
    expect(batch.body.contexts[0]).toMatchObject({ providerUserId, provinceCode: 'da-nang' });
  });

  it('returns booking display references only to an authenticated internal caller', async () => {
    const providerId = randomUUID();
    providerIds.push(providerId);
    const booking = await prisma.booking.create({
      data: {
        userId: randomUUID(), source: 'marketplace', status: 'confirmed', priceSnapshot: 200000n,
        startAt: new Date(Date.now() + 3_600_000), endAt: new Date(Date.now() + 7_200_000),
        court: { create: { name: 'Sân mã nghiệp vụ', venue: { create: {
          name: 'Cơ sở mã nghiệp vụ', address: 'Q1', lat: 10, lng: 106,
          provider: { create: { id: providerId, userId: randomUUID(), orgName: 'Provider code' } },
        } } } },
      },
    });
    bookingIds.push(booking.id);
    const priorToken = process.env.INTERNAL_SERVICE_TOKEN;
    process.env.INTERNAL_SERVICE_TOKEN = 'booking-reference-test-secret';
    try {
      await request(app).post('/internal/bookings/references').send({ bookingIds: [booking.id] }).expect(401);
      const response = await request(app)
        .post('/internal/bookings/references')
        .set('x-internal-service-token', 'booking-reference-test-secret')
        .send({ bookingIds: [booking.id] })
        .expect(200);
      expect(response.body.references).toEqual([expect.objectContaining({ id: booking.id, businessCode: booking.businessCode, startAt: booking.startAt.toISOString(), venueName: expect.any(String) })]);
      const byCode = await request(app)
        .post('/internal/bookings/references')
        .set('x-internal-service-token', 'booking-reference-test-secret')
        .send({ businessCodes: [booking.businessCode] })
        .expect(200);
      expect(byCode.body.references.map((row: { id: string }) => row.id)).toEqual([booking.id]);
    } finally {
      if (priorToken === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
      else process.env.INTERNAL_SERVICE_TOKEN = priorToken;
    }
  });
  it('D40: rejects an unauthenticated mutation of the venue-owned match-resolution command', async () => {
    const providerId = randomUUID();
    providerIds.push(providerId);
    const booking = await prisma.booking.create({
      data: {
        userId: randomUUID(), source: 'marketplace', status: 'held', priceSnapshot: 200000n,
        startAt: new Date(Date.now() + 3 * 60 * 60_000),
        endAt: new Date(Date.now() + 4 * 60 * 60_000),
        holdExpiresAt: new Date(Date.now() + 10 * 60_000),
        court: { create: {
          name: 'Sân D40', venue: { create: {
            name: 'Venue D40', address: 'Q1', lat: 10, lng: 106,
            provider: { create: { id: providerId, userId: randomUUID(), orgName: 'Provider D40' } },
          } },
        } },
      },
    });
    bookingIds.push(booking.id);
    const priorToken = process.env.INTERNAL_SERVICE_TOKEN;
    process.env.INTERNAL_SERVICE_TOKEN = 'd40-test-secret';
    try {
      await request(app)
        .post(`/internal/bookings/${booking.id}/match-resolution`)
        .send({ commandId: randomUUID(), matchId: randomUUID(), attemptId: null, action: 'cancel', venueRevision: 0 })
        .expect(401);
      await request(app)
        .post(`/internal/bookings/${booking.id}/match-resolution`)
        .set('x-internal-service-token', 'wrong-secret')
        .send({ commandId: randomUUID(), matchId: randomUUID(), attemptId: null, action: 'cancel', venueRevision: 0 })
        .expect(401);
      delete process.env.INTERNAL_SERVICE_TOKEN;
      await request(app)
        .post(`/internal/bookings/${booking.id}/match-resolution`)
        .set('x-internal-service-token', 'd40-test-secret')
        .send({ commandId: randomUUID(), matchId: randomUUID(), attemptId: null, action: 'cancel', venueRevision: 0 })
        .expect(503);
      expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: 'held' });
      expect(await prisma.matchBookingCommand.count({ where: { bookingId: booking.id } })).toBe(0);
    } finally {
      if (priorToken === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
      else process.env.INTERNAL_SERVICE_TOKEN = priorToken;
    }
  });

  it('returns the owned slot snapshot without cross-schema access', async () => {
    const providerId = randomUUID();
    providerIds.push(providerId);
    const ownerUserId = randomUUID();
    const startAt = new Date(Date.now() + 3 * 60 * 60_000);
    const booking = await prisma.booking.create({
      data: {
        userId: ownerUserId,
        source: 'marketplace',
        status: 'held',
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
        holdExpiresAt: new Date(Date.now() + 10 * 60_000),
        priceSnapshot: 400000n,
        court: {
          create: {
            name: 'Sân 1',
            venue: {
              create: {
                name: 'Sân Cầu Lông Quận 1',
                address: 'Quận 1',
                lat: 10.77,
                lng: 106.7,
                provider: { create: { id: providerId, userId: randomUUID(), orgName: 'Nhà sân' } },
              },
            },
          },
        },
      },
    });
    bookingIds.push(booking.id);

    const response = await request(app)
      .get(`/internal/bookings/${booking.id}/match-context`)
      .expect(200);

    expect(response.body).toMatchObject({
      bookingId: booking.id,
      ownerUserId,
      status: 'held',
      priceSnapshot: '400000',
      court: { name: 'Sân 1' },
      venue: { name: 'Sân Cầu Lông Quận 1', address: 'Quận 1' },
    });
    expect(response.body.startAt).toBe(startAt.toISOString());
  });

  it('AC-MMP-08-1/2: MatchCancelled releases the held booking and physical hold once', async () => {
    const providerId = randomUUID();
    providerIds.push(providerId);
    const ownerUserId = randomUUID();
    const startAt = new Date(Date.now() + 3 * 60 * 60_000);
    const court = await prisma.court.create({
      data: {
        name: 'Sân release',
        venue: {
          create: {
            name: 'Venue release', address: 'Q1', lat: 10, lng: 106,
            provider: { create: { id: providerId, userId: randomUUID(), orgName: 'Provider' } },
          },
        },
      },
    });
    const hold = await prisma.hold.create({
      data: {
        courtId: court.id, userId: ownerUserId, startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const booking = await prisma.booking.create({
      data: {
        holdId: hold.id, courtId: court.id, userId: ownerUserId, source: 'marketplace', status: 'held',
        startAt: hold.startAt, endAt: hold.endAt, holdExpiresAt: hold.expiresAt, priceSnapshot: 200000n,
      },
    });
    bookingIds.push(booking.id);
    const eventId = `MatchCancelled:${randomUUID()}`;
    eventIds.push(eventId);
    const payload = {
      matchId: randomUUID(), bookingId: booking.id, reason: 'cutoff' as const, paidJoinIds: [],
    };

    await releaseHeldMatchBooking(eventId, payload);
    await releaseHeldMatchBooking(eventId, payload);

    expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: 'cancelled' });
    expect(await prisma.hold.count({ where: { id: hold.id } })).toBe(0);
  });

  it('D39: a held withdrawal fences a stale settlement command without confirming the booking', async () => {
    const providerId = randomUUID();
    providerIds.push(providerId);
    const court = await prisma.court.create({
      data: {
        name: 'Sân D39',
        venue: {
          create: {
            name: 'Venue D39', address: 'Q1', lat: 10, lng: 106,
            provider: { create: { id: providerId, userId: randomUUID(), orgName: 'Provider D39' } },
          },
        },
      },
    });
    const startAt = new Date(Date.now() + 3 * 60 * 60_000);
    const booking = await prisma.booking.create({
      data: {
        courtId: court.id, userId: randomUUID(), source: 'marketplace', status: 'held',
        startAt, endAt: new Date(startAt.getTime() + 60 * 60_000),
        holdExpiresAt: new Date(Date.now() + 10 * 60_000), priceSnapshot: 200000n,
      },
    });
    bookingIds.push(booking.id);
    const matchId = randomUUID();
    const attemptId = randomUUID();
    const withdrawCommandId = randomUUID();
    const withdraw = await resolveMatchBooking({
      commandId: withdrawCommandId, matchId, bookingId: booking.id, attemptId,
      action: 'withdraw', venueRevision: 0,
    });
    expect(withdraw).toMatchObject({ decision: 'held_revoked', venueRevision: 1 });
    // Exact replay returns its durable receipt; the older settlement can only
    // observe the revoke and must never take the generic confirm path.
    expect(await resolveMatchBooking({
      commandId: withdrawCommandId, matchId, bookingId: booking.id, attemptId,
      action: 'withdraw', venueRevision: 0,
    })).toEqual(withdraw);
    const staleSettlement = await resolveMatchBooking({
      commandId: randomUUID(), matchId, bookingId: booking.id, attemptId,
      action: 'settle', venueRevision: 0,
    });
    expect(staleSettlement).toMatchObject({ decision: 'held_revoked', venueRevision: 1 });
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }))
      .toMatchObject({ status: 'held', matchSettlementRevision: 1 });
  });
});
