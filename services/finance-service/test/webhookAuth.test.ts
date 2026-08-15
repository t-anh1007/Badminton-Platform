import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { createApp } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { createTopupIntent } from '../src/domain/topup.js';
import { getWalletsForUser } from '../src/domain/wallet.js';
import { fakeUserId } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

const app = createApp();

describe('D23 — Xác thực webhook SePay (lỗi P1: ai biết matchCode cũng tự tạo tiền)', () => {
  it('Không có chữ ký secret -> 401, không ví nào bị thay đổi', async () => {
    const userId = fakeUserId();
    const { matchCode } = await createTopupIntent(userId, 200000n);

    const res = await request(app)
      .post('/webhooks/sepay')
      .send({ externalRef: randomUUID(), amount: '200000', rawRef: matchCode });

    expect(res.status).toBe(401);
    const wallets = await getWalletsForUser(userId);
    expect(wallets).toHaveLength(0); // không tạo/ghi ví nào
  });

  it('Chữ ký sai -> 401', async () => {
    const res = await request(app)
      .post('/webhooks/sepay')
      .set('x-sepay-signature', 'sai-secret')
      .send({ externalRef: randomUUID(), amount: '200000', rawRef: 'KLTABC' });
    expect(res.status).toBe(401);
  });

  it('amount <= 0 -> 400 (chặn số âm/không, D23)', async () => {
    const res = await request(app)
      .post('/webhooks/sepay')
      .set('x-sepay-signature', env.sepayWebhookSecret)
      .send({ externalRef: randomUUID(), amount: '-5000', rawRef: 'KLTABC' });
    expect(res.status).toBe(400);
  });

  it('Chữ ký đúng + amount hợp lệ -> 200 và ghi có ví', async () => {
    const userId = fakeUserId();
    const { matchCode } = await createTopupIntent(userId, 200000n);

    const res = await request(app)
      .post('/webhooks/sepay')
      .set('x-sepay-signature', env.sepayWebhookSecret)
      .send({ externalRef: randomUUID(), amount: '200000', rawRef: matchCode });

    expect(res.status).toBe(200);
    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(200000n);
  });
});
