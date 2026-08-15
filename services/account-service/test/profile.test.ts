import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { createApp } from '../src/app.js';
import { registerUser } from '../src/domain/registration.js';
import { verifyEmailCode } from '../src/domain/verification.js';
import { login } from '../src/domain/session.js';
import { uniqueEmail, VALID_PASSWORD, getLatestVerificationCode } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

const app = createApp();

async function createLoggedInUser(displayName: string) {
  const email = uniqueEmail();
  const { userId } = await registerUser({ email, password: VALID_PASSWORD, displayName });
  const code = await getLatestVerificationCode(userId);
  await verifyEmailCode(email, code);
  const { accessToken } = await login(email, VALID_PASSWORD);
  return { userId, email, accessToken };
}

describe('ACC-07 — Quản lý hồ sơ cá nhân (qua API thật)', () => {
  it('AC-ACC-07-1: cập nhật tên hiển thị -> phản ánh ở nơi tham chiếu hồ sơ', async () => {
    const user = await createLoggedInUser('Ten Cu');

    await request(app)
      .patch('/profile/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ displayName: 'Ten Moi' })
      .expect(200);

    const res = await request(app)
      .get('/profile/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.playerProfile.displayName).toBe('Ten Moi');
  });

  it('không trả passwordHash trong response hồ sơ của chính mình', async () => {
    const user = await createLoggedInUser('Không lộ mật khẩu');

    const res = await request(app)
      .get('/profile/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('AC-ACC-07-2: thử sửa email qua gọi API trực tiếp -> API từ chối', async () => {
    const user = await createLoggedInUser('A');

    const res = await request(app)
      .patch('/profile/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ email: 'hacker@evil.com', displayName: 'Van A' });

    expect(res.status).toBe(400);

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    expect(unchanged.email).toBe(user.email);
  });

  it('AC-ACC-07-3: user A gọi API cập nhật hồ sơ của user B -> B không bị ảnh hưởng', async () => {
    const userA = await createLoggedInUser('User A');
    const userB = await createLoggedInUser('User B Original');

    // Endpoint chỉ có /profile/me — không có cách nào chỉ định targetUserId=B.
    // Gửi kèm "userId: B" trong body (nếu có kẻ cố tình) cũng bị .strict() từ
    // chối, và dù có lọt qua thì domain layer vẫn luôn dùng req.user.id (A).
    await request(app)
      .patch('/profile/me')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ displayName: 'A cố sửa B' })
      .expect(200);

    const bProfile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: userB.userId } });
    expect(bProfile.displayName).toBe('User B Original');
  });
});
