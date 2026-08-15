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

describe('browser deployment boundary', () => {
  it('allows the configured web origin to call the service and preflight credentials', async () => {
    const response = await request(app)
      .options('/players/me/bookings')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-headers'].toLowerCase()).toContain('authorization');
  });

  it('does not reflect an unconfigured origin', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://untrusted.example');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

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

  it('GET /players/me/bookings/:id trả payment summary theo owner và snapshot hiển thị an toàn', async () => {
    const ownerId = fakeUserId();
    const otherUserId = fakeUserId();
    const provider = await createApprovedProvider();
    const { court } = await makeCourtSearchable(provider.id, undefined, 150000);
    const hold = await createHold(ownerId, { courtId: court.id, startAt: tomorrowAt(11), endAt: tomorrowAt(12) });
    const booking = await prisma.booking.create({
      data: {
        holdId: hold.id, courtId: court.id, startAt: hold.startAt, endAt: hold.endAt, userId: ownerId,
        source: 'marketplace', status: 'held', priceSnapshot: 150000n,
        policySnapshot: { tiers: [{ minHoursBeforeStart: 0, refundPercent: 0 }] }, holdExpiresAt: hold.expiresAt,
      },
    });

    const own = await request(app).get(`/players/me/bookings/${booking.id}`).set('Authorization', `Bearer ${signTestAccessToken(ownerId, ['player'])}`);
    expect(own.status).toBe(200);
    expect(own.body.booking.holdExpiresAt).toBe(hold.expiresAt.toISOString());
    expect(own.body.booking.terminalStatus).toBeNull();
    expect(own.body.booking.court).toMatchObject({ name: court.name, venue: { name: expect.any(String) } });
    expect(own.body.booking).not.toHaveProperty('bookingCode');

    const denied = await request(app).get(`/players/me/bookings/${booking.id}`).set('Authorization', `Bearer ${signTestAccessToken(otherUserId, ['player'])}`);
    expect(denied.status).toBe(403);

    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'confirmed' } });
    const confirmed = await request(app).get(`/players/me/bookings/${booking.id}`).set('Authorization', `Bearer ${signTestAccessToken(ownerId, ['player'])}`);
    expect(confirmed.body.booking.terminalStatus).toBe('confirmed');

    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } });
    const cancelled = await request(app).get(`/players/me/bookings/${booking.id}`).set('Authorization', `Bearer ${signTestAccessToken(ownerId, ['player'])}`);
    expect(cancelled.body.booking.terminalStatus).toBe('cancelled');
  });
});
