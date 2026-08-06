import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { createApp } from '../src/app.js';
import { createHold } from '../src/domain/hold.js';
import { createApprovedProvider, makeCourtSearchable, signTestAccessToken, fakeUserId } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

const app = createApp();

function tomorrowAt(hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

describe('BOK-07/08 qua HTTP — BigInt serialize (lỗi P1 Codex: res.json(bigint) ném 500)', () => {
  it('POST /bookings trả 201 (KHÔNG 500) và priceSnapshot là chuỗi', async () => {
    const userId = fakeUserId();
    const provider = await createApprovedProvider();
    const { court } = await makeCourtSearchable(provider.id, undefined, 150000);
    const hold = await createHold(userId, { courtId: court.id, startAt: tomorrowAt(9), endAt: tomorrowAt(10) });
    const token = signTestAccessToken(userId, ['player']);

    const res = await request(app).post('/bookings').set('Authorization', `Bearer ${token}`).send({ holdId: hold.id });

    expect(res.status).toBe(201);
    expect(typeof res.body.priceSnapshot).toBe('string');
    expect(res.body.priceSnapshot).toBe('150000');
  });

  it('GET /players/me/bookings trả 200 với priceSnapshot chuỗi, không 500', async () => {
    const userId = fakeUserId();
    const provider = await createApprovedProvider();
    const { court } = await makeCourtSearchable(provider.id, undefined, 120000);
    const start = new Date(Date.now() + 26 * 3600_000);
    await prisma.booking.create({
      data: { courtId: court.id, startAt: start, endAt: new Date(start.getTime() + 3600_000), userId, source: 'marketplace', status: 'confirmed', priceSnapshot: 120000n, policySnapshot: { tiers: [{ minHoursBeforeStart: 24, refundPercent: 100 }] } },
    });
    const token = signTestAccessToken(userId, ['player']);

    const res = await request(app).get('/players/me/bookings').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.upcoming).toHaveLength(1);
    expect(typeof res.body.upcoming[0].priceSnapshot).toBe('string');
  });

  it('GET /players/me/bookings/:id trả mức hoàn dự kiến từ policySnapshot (BR-BOK-06)', async () => {
    const userId = fakeUserId();
    const provider = await createApprovedProvider();
    const { court } = await makeCourtSearchable(provider.id, undefined, 120000);
    // Booking bắt đầu sau 26h -> theo snapshot 24h=100% phải ra 100%, dù chính
    // sách hiện hành có đổi cũng không áp ngược.
    const start = new Date(Date.now() + 26 * 3600_000);
    const booking = await prisma.booking.create({
      data: { courtId: court.id, startAt: start, endAt: new Date(start.getTime() + 3600_000), userId, source: 'marketplace', status: 'confirmed', priceSnapshot: 120000n, policySnapshot: { tiers: [{ minHoursBeforeStart: 24, refundPercent: 100 }, { minHoursBeforeStart: 6, refundPercent: 50 }, { minHoursBeforeStart: 0, refundPercent: 0 }] } },
    });
    const token = signTestAccessToken(userId, ['player']);

    const res = await request(app).get(`/players/me/bookings/${booking.id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.expectedRefundPercent).toBe(100);
    expect(typeof res.body.booking.priceSnapshot).toBe('string');
  });
});
