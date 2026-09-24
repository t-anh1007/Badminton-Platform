import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { getShutdownRefundPreview } from '../src/domain/shutdownPreview.js';
import { createApp } from '../src/app.js';
import request from 'supertest';

afterAll(async () => { await prisma.$disconnect(); });

describe('shutdown refund preview', () => {
  it('requires a service token and rejects requests over 500 booking IDs', async () => {
    const priorToken = process.env.INTERNAL_SERVICE_TOKEN;
    process.env.INTERNAL_SERVICE_TOKEN = 'isolated-test-service-token';
    try {
      const app = createApp();
      await request(app).post('/internal/shutdown-refund-preview').send({ bookingIds: [] }).expect(401);
      await request(app)
        .post('/internal/shutdown-refund-preview')
        .set('x-internal-service-token', 'isolated-test-service-token')
        .send({ bookingIds: Array.from({ length: 501 }, () => randomUUID()) })
        .expect(400);
    } finally {
      if (priorToken === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
      else process.env.INTERNAL_SERVICE_TOKEN = priorToken;
    }
  });

  it('includes completed checkout payments and paid/settled match contributions only', async () => {
    const checkoutBookingId = randomUUID();
    const matchBookingId = randomUUID();
    const unpaidBookingId = randomUUID();
    const matchId = randomUUID();
    const paymentIds = [randomUUID(), randomUUID()];
    try {
      await prisma.paymentIntent.createMany({
        data: paymentIds.map((userId) => ({
          userId, amount: 200000n, method: 'sepay' as const, refType: 'booking' as const,
          refId: checkoutBookingId, status: 'completed' as const,
        })),
      });
      await prisma.matchFunding.create({ data: {
        matchId, bookingId: matchBookingId, organizerUserId: randomUUID(), capacity: 3,
        feePerSlot: 100000n, bookingPrice: 300000n, organizerContribution: 100000n,
        cutoffAt: new Date(Date.now() + 60_000),
        contributions: { create: [
          { contributionKey: `preview-${randomUUID()}`, userId: randomUUID(), role: 'organizer', amount: 40000n, status: 'paid' },
          { contributionKey: `preview-${randomUUID()}`, userId: randomUUID(), role: 'participant', amount: 60000n, status: 'settled' },
          { contributionKey: `preview-${randomUUID()}`, userId: randomUUID(), role: 'participant', amount: 90000n, status: 'pending' },
          { contributionKey: `preview-${randomUUID()}`, userId: randomUUID(), role: 'participant', amount: 70000n, status: 'refunded' },
        ] },
      } });

      expect(await getShutdownRefundPreview([checkoutBookingId, matchBookingId, unpaidBookingId])).toEqual({
        [checkoutBookingId]: '400000', [matchBookingId]: '100000', [unpaidBookingId]: '0',
      });
    } finally {
      await prisma.matchFunding.deleteMany({ where: { matchId } });
      await prisma.paymentIntent.deleteMany({ where: { refId: checkoutBookingId } });
    }
  });
});
