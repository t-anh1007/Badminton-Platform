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
  it('player creates, lists and cancels a personal withdrawal with BigInt-safe fields', async () => {
    const userId = randomUUID();
    await prisma.wallet.create({
      data: { userId, walletType: 'personal', available: 120000n, withdrawable: 120000n },
    });
    const auth = { Authorization: `Bearer ${token(userId, ['player'])}` };

    const created = await request(app).post('/players/me/withdrawals').set(auth)
      .send({ amount: '100000', bankCode: 'VCB', bankAccountNumber: '0123', bankAccountName: 'A' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ amount: '100000', walletType: 'personal', status: 'pending' });

    const listed = await request(app).get('/players/me/withdrawals').set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);

    const cancelled = await request(app).post(`/players/me/withdrawals/${created.body.id}/cancel`).set(auth);
    expect(cancelled.body).toMatchObject({ status: 'rejected' });
  });
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

    await prisma.wallet.create({ data: { userId, walletType: 'personal', available: 100000n, withdrawable: 100000n } });
    await prisma.withdrawalRequest.create({
      data: { sellerUserId: userId, walletType: 'personal', amount: 10000n, transferCode: `WD${randomUUID().slice(0, 8)}`, bankCode: 'VCB', bankAccountNumber: '9999', bankAccountName: 'A' },
    });
    const providerWithdrawals = await request(app).get('/providers/me/withdrawals')
      .set('Authorization', `Bearer ${token(userId, ['player', 'provider'])}`);
    expect(providerWithdrawals.body).toHaveLength(1);
    expect(providerWithdrawals.body[0]).toMatchObject({ walletType: 'business' });
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

  it('phân trang minh bạch tài chính theo đúng provider và che tài khoản ngân hàng', async () => {
    const userId = randomUUID();
    const venueId = randomUUID();
    for (let index = 0; index < 3; index += 1) {
      await recordBookingRevenue(randomUUID(), {
        bookingId: randomUUID(), businessUserId: userId, venueId, gross: '200000',
        endAt: new Date(Date.now() - index * 60_000).toISOString(), source: 'marketplace',
      });
    }
    await recordBookingRevenue(randomUUID(), {
      bookingId: randomUUID(), businessUserId: randomUUID(), venueId: randomUUID(), gross: '900000',
      endAt: new Date().toISOString(), source: 'marketplace',
    });
    await prisma.withdrawalRequest.create({
      data: { sellerUserId: userId, walletType: 'business', amount: 10000n, transferCode: `WD${randomUUID().replace(/-/g, '').slice(0, 12)}`, bankCode: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'OWNER' },
    });
    const auth = { Authorization: `Bearer ${token(userId, ['provider'])}` };
    const page = await request(app).get('/providers/me/financial-transparency?page=2&pageSize=2').set(auth);
    expect(page.status).toBe(200);
    expect(page.body.transactions).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.body.transactions.items).toHaveLength(1);
    expect(page.body.summary).toMatchObject({ gross: '600000', refunded: '0', withdrawn: '0' });

    const flows = await request(app).get('/providers/me/financial-flows?tab=revenue&filter=pending&page=1&pageSize=5').set(auth);
    expect(flows.status).toBe(200);
    expect(flows.body).toMatchObject({ total: 3, page: 1, pageSize: 5 });
    expect(flows.body.kpis[1]).toMatchObject({ label: 'Bạn nhận', value: '540000' });
    const withdrawTab = await request(app).get('/providers/me/financial-flows?tab=withdraw&filter=pending&page=1&pageSize=5').set(auth);
    expect(withdrawTab.body.items).toHaveLength(1);
    expect(JSON.stringify(withdrawTab.body)).not.toContain('0123456789');
    const venuesTab = await request(app).get('/providers/me/financial-flows?tab=venues&filter=venue&page=1&pageSize=5').set(auth);
    expect(venuesTab.body.items[0]).toMatchObject({ amount: '540000', party: '3 lượt đặt sân' });
    const ledgerTab = await request(app).get('/providers/me/financial-flows?tab=ledger&page=1&pageSize=5').set(auth);
    expect(ledgerTab.status).toBe(200);
    expect((await request(app).get('/providers/me/financial-flows?tab=revenue&page=1&pageSize=5').set({ Authorization: `Bearer ${token(randomUUID(), ['player'])}` })).status).toBe(403);

    const withdrawals = await request(app).get('/providers/me/withdrawal-transparency?page=1&pageSize=20').set(auth);
    expect(withdrawals.status).toBe(200);
    expect(withdrawals.body.items[0]).toMatchObject({ bankAccountMasked: '•••• 6789' });
    expect(JSON.stringify(withdrawals.body)).not.toContain('0123456789');
  });

  it('Admin xem tổng quan và giao dịch ngân hàng theo phân trang chuẩn COURTIN', async () => {
    const adminId = randomUUID();
    const response = await request(app).get('/admin/financial-transparency?page=1&pageSize=2')
      .set('Authorization', `Bearer ${token(adminId, ['admin'])}`);
    expect(response.status).toBe(200);
    expect(response.body.transactions).toMatchObject({ page: 1, pageSize: 2 });
    expect(response.body.transactions.items.length).toBeLessThanOrEqual(2);
    expect(response.body.summary).toEqual(expect.objectContaining({ bankMovement: expect.any(String), allocatedMovement: expect.any(String), difference: expect.any(String), bankIn: expect.any(String), bankOut: expect.any(String), bookingRefunded: expect.any(String), playerAvailable: expect.any(String), platformReserved: expect.any(String) }));
  });
});
