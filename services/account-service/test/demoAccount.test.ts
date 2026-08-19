import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { redis, isRefreshTokenValid } from '../src/lib/redis.js';
import { verifyRefreshToken } from '../src/lib/jwt.js';
import { env } from '../src/lib/env.js';
import { demoLogin } from '../src/domain/demoAccount.js';

async function removeDemoUser() {
  const user = await prisma.user.findUnique({ where: { email: env.demoEmail } });
  if (!user) return;
  await prisma.playerProfile.deleteMany({ where: { userId: user.id } });
  await prisma.outbox.deleteMany({ where: { aggregateId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

beforeEach(removeDemoUser);
afterAll(async () => {
  await removeDemoUser();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('Cổng Test demo — demoLogin', () => {
  it('tạo tài khoản player demo đã xác minh và cấp access+refresh token dùng được', async () => {
    const result = await demoLogin();
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.roles).toEqual(['player']);

    const { jti } = verifyRefreshToken(result.refreshToken);
    expect(await isRefreshTokenValid(jti)).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: env.demoEmail } });
    expect(user.verified).toBe(true);
    expect(user.roles).toEqual(['player']);
    // Phát UserRegistered để finance cấp ví (giống luồng xác minh thật).
    const outbox = await prisma.outbox.findMany({ where: { aggregateId: user.id, eventType: 'UserRegistered' } });
    expect(outbox).toHaveLength(1);
  });

  it('idempotent — bấm nhiều lần dùng lại đúng một tài khoản demo', async () => {
    await demoLogin();
    await demoLogin();
    const users = await prisma.user.findMany({ where: { email: env.demoEmail } });
    expect(users).toHaveLength(1);
  });

  it('tự mở khóa tài khoản demo nếu trước đó bị khóa', async () => {
    await demoLogin();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: env.demoEmail } });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'locked' } });

    const result = await demoLogin();
    expect(result.roles).toEqual(['player']);
    const after = await prisma.user.findUniqueOrThrow({ where: { email: env.demoEmail } });
    expect(after.status).toBe('active');
  });
});
