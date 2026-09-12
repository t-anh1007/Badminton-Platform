import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { prisma } from '../src/lib/prisma.js';
import { recordBookingRevenue } from '../src/domain/revenue.js';
import type { ObjectStorageClient } from '@khoaluantn/object-storage';

const authorizeUpload = async ({ ownerUserId, mimeType }: { ownerUserId: string; mimeType: string }) => ({
  objectKey: `finance/disputes/${ownerUserId}/proof.${mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'}`,
  uploadUrl: 'https://storage.test/put', headers: { 'Content-Type': mimeType }, expiresAt: '2026-09-10T00:10:00.000Z',
});
const objectStorage: ObjectStorageClient = {
  authorizeUpload: authorizeUpload as ObjectStorageClient['authorizeUpload'],
  assertOwnedObject: async () => undefined,
  getReadUrl: async (key, options) => options?.visibility === 'private' ? `https://storage.test/signed/${key}` : `https://cdn.test/${key}`,
  deleteObject: async () => undefined,
};
const app = createApp({ objectStorage });
const token = (userId: string, roles: string[]) => jwt.sign({ sub: userId, roles, type: 'access' }, env.jwtSecret);

async function fixture() {
  const bookingId = randomUUID();
  const playerId = randomUUID();
  await prisma.paymentIntent.create({
    data: { userId: playerId, amount: 200000n, method: 'balance', refType: 'booking', refId: bookingId, status: 'completed' },
  });
  await recordBookingRevenue(randomUUID(), {
    bookingId, businessUserId: randomUUID(), venueId: randomUUID(), gross: '200000',
    endAt: new Date(Date.now() - 3_600_000).toISOString(), source: 'marketplace',
  });
  return { bookingId, playerId };
}

afterAll(async () => prisma.$disconnect());

describe('G7 HTTP contract', () => {
  it('player xem booking đủ điều kiện, gửi và xem tranh chấp của chính mình', async () => {
    const data = await fixture();
    const auth = `Bearer ${token(data.playerId, ['player'])}`;
    const eligible = await request(app).get('/players/me/dispute-eligible').set('Authorization', auth);
    expect(eligible.status).toBe(200);
    expect(eligible.body).toContainEqual(expect.objectContaining({ bookingId: data.bookingId, gross: '200000' }));

    const upload = await request(app).post('/players/me/dispute-evidence-upload').set('Authorization', auth)
      .send({ mimeType: 'image/webp' });
    expect(upload.status).toBe(201);
    expect(upload.body.objectKey).toBe(`finance/disputes/${data.playerId}/proof.webp`);

    const created = await request(app).post('/players/me/disputes').set('Authorization', auth)
      .send({ bookingId: data.bookingId, reason: 'Sân không đúng mô tả', contactPhone: '090 123-4567', evidence: [upload.body.objectKey] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ bookingId: data.bookingId, status: 'open', reason: 'Sân không đúng mô tả', contactPhone: '0901234567' });

    const mine = await request(app).get('/players/me/disputes').set('Authorization', auth);
    expect(mine.status).toBe(200);
    expect(mine.body).toContainEqual(expect.objectContaining({ id: created.body.id, status: 'open', evidence: [`https://storage.test/signed/${upload.body.objectKey}`] }));
  });

  it('chỉ Admin xem queue/resolve; amount truyền bằng chuỗi BigInt và lý do bắt buộc', async () => {
    const data = await fixture();
    const playerAuth = `Bearer ${token(data.playerId, ['player'])}`;
    const created = await request(app).post('/players/me/disputes').set('Authorization', playerAuth)
      .send({ bookingId: data.bookingId, reason: 'Khiếu nại', contactPhone: '0901234567', evidence: [] });
    const forbidden = await request(app).get('/admin/disputes').set('Authorization', playerAuth);
    expect(forbidden.status).toBe(403);

    const adminAuth = `Bearer ${token(randomUUID(), ['player', 'admin'])}`;
    const blank = await request(app).post(`/admin/disputes/${created.body.id}/resolve`).set('Authorization', adminAuth)
      .send({ decision: 'partial_refund', amount: '80000', reason: '' });
    expect(blank.status).toBe(400);
    const resolved = await request(app).post(`/admin/disputes/${created.body.id}/resolve`).set('Authorization', adminAuth)
      .send({ decision: 'partial_refund', amount: '80000', reason: 'Hoàn theo bằng chứng' });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ status: 'resolved', resolution: 'partial_refund', resolutionAmount: '80000' });
    const queue = await request(app).get('/admin/disputes').set('Authorization', adminAuth);
    expect(queue.status).toBe(200);
    expect(queue.body).toContainEqual(expect.objectContaining({
      id: created.body.id, resolutionAmount: '80000',
      contactPhone: '0901234567',
      revenue: expect.objectContaining({ gross: '200000', net: '108000', commission: '12000' }),
      ledgerEntries: expect.arrayContaining([expect.objectContaining({ refType: 'dispute', amount: '80000' })]),
    }));
  });
});
