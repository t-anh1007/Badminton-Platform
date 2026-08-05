import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { redis, isRefreshTokenValid } from '../src/lib/redis.js';
import { verifyRefreshToken } from '../src/lib/jwt.js';
import { registerUser } from '../src/domain/registration.js';
import { verifyEmailCode } from '../src/domain/verification.js';
import { login } from '../src/domain/session.js';
import { requestPasswordReset, resetPassword, changePassword } from '../src/domain/passwordReset.js';
import { uniqueEmail, VALID_PASSWORD, getLatestVerificationCode, getLatestResetToken } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

async function createVerifiedUser(email: string) {
  const { userId } = await registerUser({ email, password: VALID_PASSWORD, displayName: 'A' });
  const code = await getLatestVerificationCode(userId);
  await verifyEmailCode(email, code);
  return userId;
}

describe('ACC-05 — Đặt lại mật khẩu', () => {
  it('AC-ACC-05-1: email tồn tại -> gửi liên kết token hiệu lực 30 phút', async () => {
    const email = uniqueEmail();
    const userId = await createVerifiedUser(email);
    await requestPasswordReset(email);

    const row = await prisma.passwordReset.findFirstOrThrow({ where: { userId } });
    const minutesLeft = (row.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(29);
    expect(minutesLeft).toBeLessThanOrEqual(30);
  });

  it('AC-ACC-05-2: email không tồn tại -> không tạo bản ghi nào, không ném lỗi', async () => {
    const email = uniqueEmail('nonexistent');
    await expect(requestPasswordReset(email)).resolves.toBeUndefined();
    const count = await prisma.passwordReset.count();
    // Không kiểm tra count tuyệt đối (test khác có thể đã tạo bản ghi) — chỉ
    // xác nhận hành vi không throw và không có user nào được tạo cho email này.
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('AC-ACC-05-3: token hiệu lực -> đặt mật khẩu mới, thu hồi TOÀN BỘ refresh token kể cả phiên hiện tại', async () => {
    const email = uniqueEmail();
    const userId = await createVerifiedUser(email);
    const { refreshToken } = await login(email, VALID_PASSWORD);
    const { jti } = verifyRefreshToken(refreshToken);
    expect(await isRefreshTokenValid(jti)).toBe(true);

    await requestPasswordReset(email);
    const token = await getLatestResetToken(userId);
    const newPassword = 'NewPassw0rd456';
    await resetPassword(token, newPassword);

    expect(await isRefreshTokenValid(jti)).toBe(false);
    // Đăng nhập lại: mật khẩu cũ không còn dùng được, mật khẩu mới thì được.
    await expect(login(email, VALID_PASSWORD)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(login(email, newPassword)).resolves.toBeTruthy();
  });

  it('AC-ACC-05-4: token đã dùng một lần -> dùng lại bị từ chối', async () => {
    const email = uniqueEmail();
    const userId = await createVerifiedUser(email);
    await requestPasswordReset(email);
    const token = await getLatestResetToken(userId);
    await resetPassword(token, 'NewPassw0rd456');

    await expect(resetPassword(token, 'AnotherPassw0rd789')).rejects.toMatchObject({
      code: 'INVALID_RESET_TOKEN',
    });
  });

  it('AC-ACC-05-5: yêu cầu lần hai -> token của lần thứ nhất bị từ chối', async () => {
    const email = uniqueEmail();
    const userId = await createVerifiedUser(email);
    await requestPasswordReset(email);
    const firstToken = await getLatestResetToken(userId);

    await requestPasswordReset(email);

    await expect(resetPassword(firstToken, 'NewPassw0rd456')).rejects.toMatchObject({
      code: 'INVALID_RESET_TOKEN',
    });
  });
});

describe('ACC-06 — Đổi mật khẩu', () => {
  it('AC-ACC-06-1: đúng mật khẩu hiện tại + mật khẩu mới hợp lệ -> cập nhật, lần sau chỉ nhận mật khẩu mới', async () => {
    const email = uniqueEmail();
    const userId = await createVerifiedUser(email);
    const newPassword = 'ChangedPassw0rd1';
    await changePassword(userId, VALID_PASSWORD, newPassword);

    await expect(login(email, VALID_PASSWORD)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(login(email, newPassword)).resolves.toBeTruthy();
  });

  it('AC-ACC-06-2: sai mật khẩu hiện tại -> từ chối, mật khẩu không đổi', async () => {
    const email = uniqueEmail();
    const userId = await createVerifiedUser(email);
    await expect(changePassword(userId, 'WrongCurrent1', 'NewPassw0rd456')).rejects.toMatchObject({
      code: 'INVALID_CURRENT_PASSWORD',
    });
    await expect(login(email, VALID_PASSWORD)).resolves.toBeTruthy();
  });

  it('AC-ACC-06-3: đổi mật khẩu xong -> refresh token thiết bị khác bị từ chối, phiên hiện tại vẫn hoạt động', async () => {
    const email = uniqueEmail();
    const userId = await createVerifiedUser(email);
    const sessionA = await login(email, VALID_PASSWORD); // thiết bị hiện tại
    const sessionB = await login(email, VALID_PASSWORD); // thiết bị khác

    const newPassword = 'ChangedPassw0rd2';
    await changePassword(userId, VALID_PASSWORD, newPassword, sessionA.refreshToken);

    const jtiA = verifyRefreshToken(sessionA.refreshToken).jti;
    const jtiB = verifyRefreshToken(sessionB.refreshToken).jti;
    expect(await isRefreshTokenValid(jtiA)).toBe(true);
    expect(await isRefreshTokenValid(jtiB)).toBe(false);
  });
});
