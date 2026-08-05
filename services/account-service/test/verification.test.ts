import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { registerUser } from '../src/domain/registration.js';
import { verifyEmailCode, resendVerificationCode, MAX_RESENDS_PER_HOUR } from '../src/domain/verification.js';
import { AppError } from '../src/lib/errors.js';
import { getLatestVerificationCode, uniqueEmail, VALID_PASSWORD } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

async function registerAndGetCode(email: string) {
  const { userId } = await registerUser({ email, password: VALID_PASSWORD, displayName: 'A' });
  const code = await getLatestVerificationCode(userId);
  return { userId, code };
}

describe('ACC-02 — Xác minh email', () => {
  it('AC-ACC-02-1: mã còn hiệu lực -> verified=true, UserRegistered phát đúng một lần', async () => {
    const email = uniqueEmail();
    const { userId, code } = await registerAndGetCode(email);

    await verifyEmailCode(email, code);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.verified).toBe(true);

    const events = await prisma.outbox.findMany({
      where: { aggregateId: userId, eventType: 'UserRegistered' },
    });
    expect(events).toHaveLength(1);
  });

  it('AC-ACC-02-2: mã quá 15 phút -> từ chối, verified giữ nguyên false', async () => {
    const email = uniqueEmail();
    const { userId, code } = await registerAndGetCode(email);
    // Giả lập hết hạn — chỉnh thẳng expiresAt về quá khứ (test white-box, hợp lệ
    // vì mục tiêu là kiểm chứng nhánh "hết hạn", không phải chờ 15 phút thật).
    await prisma.verification.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await expect(verifyEmailCode(email, code)).rejects.toMatchObject({ code: 'INVALID_CODE' });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.verified).toBe(false);
  });

  it('AC-ACC-02-3: mã đã dùng một lần -> nhập lại bị từ chối', async () => {
    const email = uniqueEmail();
    const { code } = await registerAndGetCode(email);
    await verifyEmailCode(email, code);
    await expect(verifyEmailCode(email, code)).rejects.toMatchObject({ code: 'INVALID_CODE' });
  });

  it('AC-ACC-02-4: đã gửi lại 3 lần trong 1 giờ -> lần thứ tư bị từ chối kèm thời điểm thử lại', async () => {
    const email = uniqueEmail();
    await registerAndGetCode(email);

    for (let i = 0; i < MAX_RESENDS_PER_HOUR; i++) {
      await resendVerificationCode(email);
    }

    await expect(resendVerificationCode(email)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe('RESEND_LIMIT_EXCEEDED');
      expect(appErr.meta?.retryAfterSec).toBeGreaterThan(0);
      return true;
    });
  });

  it.skip('AC-ACC-02-5: xác minh xong -> đúng một ví personal số dư 0 ở finance [BLOCKED: chờ G4 — finance-service consume UserRegistered]', () => {
    // Producer side đã kiểm ở AC-ACC-02-1 (Outbox ghi UserRegistered đúng 1 lần).
    // Phần tạo ví thuộc finance-service, xây ở G4 theo phase-1-handoff.md.
  });
});
