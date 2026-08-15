import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { redis, getLoginLockRemainingSec, isRefreshTokenValid } from '../src/lib/redis.js';
import { verifyRefreshToken } from '../src/lib/jwt.js';
import { registerUser } from '../src/domain/registration.js';
import { verifyEmailCode } from '../src/domain/verification.js';
import { login, logout } from '../src/domain/session.js';
import { GENERIC_AUTH_ERROR } from '../src/lib/errors.js';
import { uniqueEmail, VALID_PASSWORD, getLatestVerificationCode } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

async function createVerifiedUser(email: string, roles: string[] = ['player']) {
  const { userId } = await registerUser({ email, password: VALID_PASSWORD, displayName: 'A' });
  const code = await getLatestVerificationCode(userId);
  await verifyEmailCode(email, code);
  if (roles.length > 1 || roles[0] !== 'player') {
    await prisma.user.update({ where: { id: userId }, data: { roles } });
  }
  return userId;
}

describe('ACC-03 — Đăng nhập', () => {
  it('AC-ACC-03-1: tài khoản đã xác minh + đúng mật khẩu -> cấp access+refresh token đủ vai trò', async () => {
    const email = uniqueEmail();
    await createVerifiedUser(email);
    const result = await login(email, VALID_PASSWORD);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.roles).toEqual(['player']);
  });

  it('AC-ACC-03-2: verified=false + đúng mật khẩu -> từ chối cấp token', async () => {
    const email = uniqueEmail();
    await registerUser({ email, password: VALID_PASSWORD, displayName: 'A' }); // chưa verify
    await expect(login(email, VALID_PASSWORD)).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });

  it('AC-ACC-03-3: status=locked + đúng mật khẩu -> từ chối cấp token', async () => {
    const email = uniqueEmail();
    const userId = await createVerifiedUser(email);
    await prisma.user.update({ where: { id: userId }, data: { status: 'locked' } });
    await expect(login(email, VALID_PASSWORD)).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
  });

  it('AC-ACC-03-4: email không tồn tại -> thông báo lỗi giống hệt sai mật khẩu', async () => {
    const emailReal = uniqueEmail();
    await createVerifiedUser(emailReal);

    let wrongPasswordMessage = '';
    try {
      await login(emailReal, 'WrongPassw0rd1');
    } catch (err) {
      wrongPasswordMessage = (err as Error).message;
    }

    let noSuchEmailMessage = '';
    try {
      await login(uniqueEmail('nonexistent'), 'WhateverPassw0rd1');
    } catch (err) {
      noSuchEmailMessage = (err as Error).message;
    }

    expect(wrongPasswordMessage).toBe(GENERIC_AUTH_ERROR);
    expect(noSuchEmailMessage).toBe(GENERIC_AUTH_ERROR);
    expect(noSuchEmailMessage).toBe(wrongPasswordMessage);
  });

  it('AC-ACC-03-5: sai mật khẩu 5 lần trong 15 phút -> lần thứ sáu (kể cả đúng mk) bị từ chối kèm thời điểm thử lại', async () => {
    const email = uniqueEmail();
    await createVerifiedUser(email);

    for (let i = 0; i < 5; i++) {
      await expect(login(email, 'WrongPassw0rd1')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }

    // Lần thứ sáu — dùng ĐÚNG mật khẩu, vẫn phải bị chặn bởi khóa tạm.
    await expect(login(email, VALID_PASSWORD)).rejects.toMatchObject({ code: 'LOGIN_TEMP_LOCKED' });
    const remaining = await getLoginLockRemainingSec(email.trim().toLowerCase());
    expect(remaining).toBeGreaterThan(0);
  });

  it('AC-ACC-03-6: user có cả hai vai player+provider -> token chứa cả hai vai', async () => {
    const email = uniqueEmail();
    await createVerifiedUser(email, ['player', 'provider']);
    const result = await login(email, VALID_PASSWORD);
    expect(result.roles.sort()).toEqual(['player', 'provider'].sort());
  });
});

describe('ACC-04 — Đăng xuất', () => {
  it('AC-ACC-04-1: đăng xuất -> refresh token không còn dùng được nữa', async () => {
    const email = uniqueEmail();
    await createVerifiedUser(email);
    const { refreshToken } = await login(email, VALID_PASSWORD);
    const { jti } = verifyRefreshToken(refreshToken);
    expect(await isRefreshTokenValid(jti)).toBe(true);

    await logout(refreshToken);
    expect(await isRefreshTokenValid(jti)).toBe(false);
  });

  it('AC-ACC-04-2: gọi đăng xuất lại với token đã thu hồi -> vẫn trả thành công', async () => {
    const email = uniqueEmail();
    await createVerifiedUser(email);
    const { refreshToken } = await login(email, VALID_PASSWORD);

    await logout(refreshToken);
    await expect(logout(refreshToken)).resolves.toBeUndefined(); // không ném lỗi
  });
});
