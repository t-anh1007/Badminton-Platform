import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { prisma } from '../src/lib/prisma.js';
import { recordBookingRevenue } from '../src/domain/revenue.js';

const app = createApp();
const token = (userId: string, roles: string[]) => jwt.sign({ sub: userId, roles, type: 'access' }, env.jwtSecret);

afterAll(async () => prisma.$disconnect());

describe('G6 HTTP contract', () => {
  it('provider xem revenue của mình và tạo withdrawal bằng chuỗi BigInt an toàn', async () => {
    const userId = randomUUID();
    await recordBookingRevenue(randomUUID(), {
      bookingId: randomUUID(), businessUserId: userId, venueId: randomUUID(), gross: '200000',
      endAt: new Date(Date.now() + 3_600_000).toISOString(), source: 'marketplace',
    });
    await prisma.wallet.updateMany({ where: { userId, walletType: 'business' }, data: { available: 200000n, pending: 0n } });
    const revenue = await request(app).get('/providers/me/revenue').set('Authorization', `Bearer ${token(userId, ['player', 'provider'])}`);
    expect(revenue.status).toBe(200);
    expect(revenue.body[0]).toMatchObject({ gross: '200000', net: '180000', commission: '20000' });

    const withdrawal = await request(app).post('/providers/me/withdrawals')
      .set('Authorization', `Bearer ${token(userId, ['player', 'provider'])}`)
      .send({ amount: '100000', bankCode: 'VCB', bankAccountNumber: '0123', bankAccountName: 'A' });
    expect(withdrawal.status).toBe(201);
    expect(withdrawal.body).toMatchObject({ amount: '100000', status: 'pending' });
  });

  it('player không có business wallet bị từ chối và provider không đọc được hàng Admin', async () => {
    const userId = randomUUID();
    const create = await request(app).post('/providers/me/withdrawals')
      .set('Authorization', `Bearer ${token(userId, ['player'])}`)
      .send({ amount: '100000', bankCode: 'VCB', bankAccountNumber: '0123', bankAccountName: 'A' });
    expect(create.status).toBe(403);
    const adminQueue = await request(app).get('/admin/reconciliation').set('Authorization', `Bearer ${token(userId, ['player', 'provider'])}`);
    expect(adminQueue.status).toBe(403);
  });

  it('Admin xem được queue và CORS chỉ phản chiếu WEB_ORIGIN tin cậy', async () => {
    const adminId = randomUUID();
    const queue = await request(app).get('/admin/reconciliation').set('Authorization', `Bearer ${token(adminId, ['player', 'admin'])}`);
    expect(queue.status).toBe(200);
    const preflight = await request(app).options('/admin/reconciliation').set('Origin', 'http://localhost:5173');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
