import { describe, it, expect, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
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

const sepayId = () => Math.floor(Math.random() * 1_000_000_000);

/** Ký body y hệt cách SePay ký: `{timestamp}.{raw_body}` bằng HMAC-SHA256. */
function signed(body: object, secret = env.sepayWebhookSecret) {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = `sha256=${createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex')}`;
  return { raw, ts, signature };
}

function postSigned(body: object, secret = env.sepayWebhookSecret) {
  const { raw, ts, signature } = signed(body, secret);
  return request(app)
    .post('/webhooks/sepay')
    .set('content-type', 'application/json')
    .set('x-sepay-timestamp', ts)
    .set('x-sepay-signature', signature)
    .send(raw);
}

describe('D23 — Xác thực webhook SePay HMAC-SHA256 (lỗi P1: ai biết matchCode cũng tự tạo tiền)', () => {
  it('Không có chữ ký -> 401, không ví nào bị thay đổi', async () => {
    const userId = fakeUserId();
    const { matchCode } = await createTopupIntent(userId, 200000n);

    const res = await request(app)
      .post('/webhooks/sepay')
      .send({ id: sepayId(), transferType: 'in', transferAmount: 200000, content: matchCode });

    expect(res.status).toBe(401);
    const wallets = await getWalletsForUser(userId);
    expect(wallets).toHaveLength(0); // không tạo/ghi ví nào
  });

  it('Chữ ký sai (secret khác) -> 401', async () => {
    const res = await postSigned(
      { id: sepayId(), transferType: 'in', transferAmount: 200000, content: 'KLTAB12CD34' },
      'secret-gia-mao',
    );
    expect(res.status).toBe(401);
  });

  it('Chữ ký hợp lệ nhưng body bị sửa sau khi ký -> 401', async () => {
    const { ts, signature } = signed({ id: 1, transferType: 'in', transferAmount: 200000, content: 'KLTAB12CD34' });
    const res = await request(app)
      .post('/webhooks/sepay')
      .set('content-type', 'application/json')
      .set('x-sepay-timestamp', ts)
      .set('x-sepay-signature', signature)
      .send(JSON.stringify({ id: 1, transferType: 'in', transferAmount: 999999, content: 'KLTAB12CD34' }));
    expect(res.status).toBe(401);
  });

  it('amount <= 0 -> 400 (chặn số âm/không, D23)', async () => {
    const res = await postSigned({ id: sepayId(), transferType: 'in', transferAmount: -5000, content: 'KLTAB12CD34' });
    expect(res.status).toBe(400);
  });

  it('Chữ ký đúng + amount hợp lệ -> 200 và ghi có ví (trích mã từ nội dung có tiền tố VA)', async () => {
    const userId = fakeUserId();
    const { matchCode } = await createTopupIntent(userId, 200000n);

    const res = await postSigned({ id: sepayId(), transferType: 'in', transferAmount: 200000, content: `TKPCTN${matchCode}` });

    expect(res.status).toBe(200);
    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(200000n);
  });
});
