import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp as createMatchmakingApp } from '../src/app.js';
import { HttpAccountClient } from '../src/clients/account.js';
import { HttpVenueBookingClient } from '../src/clients/venueBooking.js';
import { prisma as matchmakingPrisma } from '../src/lib/prisma.js';
import { createApp as createAccountApp } from '../../account-service/src/app.js';
import { prisma as accountPrisma } from '../../account-service/src/lib/prisma.js';
import { createApp as createVenueApp } from '../../venue-booking-service/src/app.js';
import { prisma as venuePrisma } from '../../venue-booking-service/src/lib/prisma.js';

const runServiceE2E = process.env.RUN_P2_SERVICE_E2E === '1';
const describeServiceE2E = runServiceE2E ? describe : describe.skip;
let accountServer: Server | undefined;
let venueServer: Server | undefined;
let userId: string | undefined;
let providerId: string | undefined;
let matchId: string | undefined;

async function listen(server: Server): Promise<number> {
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  return address.port;
}

async function close(server: Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

afterAll(async () => {
  await close(accountServer);
  await close(venueServer);
  if (matchId) {
    await matchmakingPrisma.outbox.deleteMany({ where: { aggregateId: matchId } });
    await matchmakingPrisma.match.deleteMany({ where: { id: matchId } });
  }
  if (userId) {
    await matchmakingPrisma.passport.deleteMany({ where: { userId } });
    await accountPrisma.playerProfile.deleteMany({ where: { userId } });
    await accountPrisma.user.deleteMany({ where: { id: userId } });
  }
  if (providerId) {
    await venuePrisma.booking.deleteMany({ where: { court: { venue: { providerId } } } });
    await venuePrisma.hold.deleteMany({ where: { court: { venue: { providerId } } } });
    await venuePrisma.pricingRule.deleteMany({ where: { court: { venue: { providerId } } } });
    await venuePrisma.court.deleteMany({ where: { venue: { providerId } } });
    await venuePrisma.venue.deleteMany({ where: { providerId } });
    await venuePrisma.provider.deleteMany({ where: { id: providerId } });
  }
  await Promise.all([
    matchmakingPrisma.$disconnect(),
    accountPrisma.$disconnect(),
    venuePrisma.$disconnect(),
  ]);
});

describeServiceE2E('P2-M2 real HTTP service chain', () => {
  it('creates and reads a match through account and venue APIs without cross-schema queries', async () => {
    userId = randomUUID();
    providerId = randomUUID();
    await accountPrisma.user.create({
      data: {
        id: userId,
        email: `${randomUUID()}@example.test`,
        passwordHash: 'not-used',
        roles: ['player'],
        verified: true,
        playerProfile: { create: { displayName: 'Organizer E2E', visibility: 'private' } },
      },
    });
    await matchmakingPrisma.passport.create({
      data: {
        userId,
        declaredTier: 'intermediate_plus',
        ratingMu: 1700,
        ratingRd: 80,
        ratingSigma: 0.06,
      },
    });
    const startAt = new Date(Date.now() + 24 * 60 * 60_000);
    startAt.setUTCMinutes(0, 0, 0);
    const court = await venuePrisma.court.create({
      data: {
        name: 'Sân E2E',
        venue: {
          create: {
            name: 'Venue E2E', address: 'Quận 1', lat: 10.77, lng: 106.7,
            provider: { create: { id: providerId, userId: randomUUID(), orgName: 'Provider E2E' } },
          },
        },
      },
    });
    await venuePrisma.pricingRule.create({
      data: {
        courtId: court.id,
        weekday: startAt.getUTCDay(),
        startMinute: startAt.getUTCHours() * 60,
        endMinute: startAt.getUTCHours() * 60 + 60,
        price: 400000n,
        effectiveFrom: new Date(startAt.getTime() - 60_000),
      },
    });
    const hold = await venuePrisma.hold.create({
      data: {
        courtId: court.id,
        userId,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });

    accountServer = createAccountApp().listen(0, '127.0.0.1');
    venueServer = createVenueApp().listen(0, '127.0.0.1');
    const [accountPort, venuePort] = await Promise.all([listen(accountServer), listen(venueServer)]);
    const app = createMatchmakingApp({
      accountClient: new HttpAccountClient(`http://127.0.0.1:${accountPort}`),
      venueBookingClient: new HttpVenueBookingClient(`http://127.0.0.1:${venuePort}`),
    });
    const token = jwt.sign(
      { sub: userId, roles: ['player'], type: 'access' },
      process.env.JWT_SECRET ?? 'change-me-in-real-env',
      { expiresIn: 300 },
    );

    const createdResponses = await Promise.all(Array.from({ length: 6 }, () => request(app)
      .post('/matches')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: hold.id, capacity: 4, feeMode: 'split' })
      .expect(201)));
    const [created] = createdResponses;
    matchId = created!.body.id;
    expect(new Set(createdResponses.map((response) => response.body.id))).toEqual(new Set([matchId]));
    expect(await venuePrisma.booking.count({ where: { holdId: hold.id } })).toBe(1);
    expect(await matchmakingPrisma.match.count({ where: { bookingId: created!.body.bookingId } })).toBe(1);
    expect(await matchmakingPrisma.outbox.count({
      where: { aggregateId: matchId, eventType: 'MatchCreated' },
    })).toBe(1);
    const detail = await request(app).get(`/matches/${matchId}`).expect(200);

    expect(created.body.feePerSlot).toBe('100000');
    expect(detail.body).toMatchObject({
      organizer: { displayName: 'Người tổ chức', identityVisibility: 'hidden', tier: 'intermediate_plus' },
      court: { name: 'Sân E2E' },
      venue: { name: 'Venue E2E', address: 'Quận 1' },
    });
  });
});
