import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();
const providerIds: string[] = [];

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { court: { venue: { providerId: { in: providerIds } } } } });
  await prisma.court.deleteMany({ where: { venue: { providerId: { in: providerIds } } } });
  await prisma.venue.deleteMany({ where: { providerId: { in: providerIds } } });
  await prisma.provider.deleteMany({ where: { id: { in: providerIds } } });
  await prisma.$disconnect();
});

describe('matchmaking booking context contract', () => {
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
});
