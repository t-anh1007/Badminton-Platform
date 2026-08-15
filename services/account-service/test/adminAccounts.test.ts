import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { createApp } from '../src/app.js';
import { registerUser } from '../src/domain/registration.js';
import { verifyEmailCode } from '../src/domain/verification.js';
import { login } from '../src/domain/session.js';
import { lockAccount, unlockAccount } from '../src/domain/adminAccounts.js';
import { isRefreshTokenValid } from '../src/lib/redis.js';
import { verifyRefreshToken } from '../src/lib/jwt.js';
import { uniqueEmail, VALID_PASSWORD, getLatestVerificationCode } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

const app = createApp();

async function createVerifiedUser(roles: string[] = ['player']) {
  const email = uniqueEmail();
  const { userId } = await registerUser({ email, password: VALID_PASSWORD, displayName: 'A' });
  const code = await getLatestVerificationCode(userId);
  await verifyEmailCode(email, code);
  if (roles.length > 1 || roles[0] !== 'player') {
    await prisma.user.update({ where: { id: userId }, data: { roles } });
  }
  return { userId, email };
}

describe('ACC-08 — Quản lý quyền truy cập tài khoản (khóa / khôi phục)', () => {
  it('returns only safe account summaries to an admin', async () => { const admin=await createVerifiedUser(['admin']); const target=await createVerifiedUser(); const token=(await login(admin.email, VALID_PASSWORD)).accessToken; const res=await request(app).get('/admin/users?query='+encodeURIComponent(target.email)).set('Authorization', `Bearer ${token}`); expect(res.status).toBe(200); expect(res.body[0]).toMatchObject({ email: target.email, roles: ['player'] }); expect(res.body[0]).not.toHaveProperty('passwordHash') });
  it('AC-ACC-08-1: Admin nhập lý do -> status=locked, thu hồi hết refresh token, ghi ACCOUNT_AUDIT đúng lý do', async () => {
    const admin = await createVerifiedUser(['admin']);
    const target = await createVerifiedUser();
    const { refreshToken } = await login(target.email, VALID_PASSWORD);
    const { jti } = verifyRefreshToken(refreshToken);
    expect(await isRefreshTokenValid(jti)).toBe(true);

    await lockAccount(admin.userId, target.userId, 'Vi phạm điều khoản sử dụng');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(user.status).toBe('locked');
    expect(await isRefreshTokenValid(jti)).toBe(false);

    const audit = await prisma.accountAudit.findFirstOrThrow({
      where: { targetUserId: target.userId, action: 'lock' },
    });
    expect(audit.reason).toBe('Vi phạm điều khoản sử dụng');
  });

  it('AC-ACC-08-2: Admin không nhập lý do -> từ chối, trạng thái không đổi', async () => {
    const admin = await createVerifiedUser(['admin']);
    const target = await createVerifiedUser();

    await expect(lockAccount(admin.userId, target.userId, '')).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(user.status).toBe('active');
  });

  it.skip('AC-ACC-08-3: khóa NCC có 3 booking confirmed -> booking giữ nguyên, cơ sở biến mất khỏi tìm kiếm [BLOCKED: chờ G2 — venue-booking-service tiêu thụ AccountLocked]', () => {
    // Producer side đã kiểm ở test AccountLocked event dưới đây.
  });

  it.skip('AC-ACC-08-4: NCC đang bị khóa, người chơi gọi thẳng API tạo booking mới -> từ chối [BLOCKED: chờ G2 — venue-booking-service]', () => {});

  it('AC-ACC-08-5: Admin khôi phục tài khoản đang locked -> status=active, tạo bản ghi audit thứ hai', async () => {
    const admin = await createVerifiedUser(['admin']);
    const target = await createVerifiedUser();
    await lockAccount(admin.userId, target.userId, 'Tạm khóa để xác minh');

    await unlockAccount(admin.userId, target.userId, 'Đã xác minh xong, khôi phục');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(user.status).toBe('active');

    const audits = await prisma.accountAudit.findMany({
      where: { targetUserId: target.userId },
      orderBy: { ts: 'asc' },
    });
    expect(audits).toHaveLength(2);
    expect(audits[0]!.action).toBe('lock');
    expect(audits[1]!.action).toBe('unlock');
  });

  it('AC-ACC-08-6: user không có vai admin gọi API khóa tài khoản -> từ chối', async () => {
    const nonAdmin = await createVerifiedUser(); // roles: [player]
    const target = await createVerifiedUser();
    const { accessToken } = await login(nonAdmin.email, VALID_PASSWORD);

    const res = await request(app)
      .post(`/admin/users/${target.userId}/lock`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Thử khóa trái phép' });

    expect(res.status).toBe(403);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(user.status).toBe('active');
  });

  it('AccountLocked event: phát đúng cấu trúc khi khóa và khi khôi phục (producer side, G2 tiêu thụ sau)', async () => {
    const admin = await createVerifiedUser(['admin']);
    const target = await createVerifiedUser();

    await lockAccount(admin.userId, target.userId, 'test lock');
    const lockEvent = await prisma.outbox.findFirstOrThrow({
      where: { aggregateId: target.userId, eventType: 'AccountLocked' },
      orderBy: { createdAt: 'asc' },
    });
    expect((lockEvent.payload as { locked: boolean; stateVersion: number })).toMatchObject({
      locked: true,
      stateVersion: 1,
    });

    await unlockAccount(admin.userId, target.userId, 'test unlock');
    const events = await prisma.outbox.findMany({
      where: { aggregateId: target.userId, eventType: 'AccountLocked' },
      orderBy: { createdAt: 'asc' },
    });
    expect(events).toHaveLength(2);
    expect((events[1]!.payload as { locked: boolean; stateVersion: number })).toMatchObject({
      locked: false,
      stateVersion: 2,
    });
  });
});
