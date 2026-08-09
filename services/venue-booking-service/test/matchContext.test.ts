import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { releaseHeldMatchBooking, resolveMatchBooking } from '../src/domain/booking.js';

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
        name: 'SÃ¢n D39',
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
