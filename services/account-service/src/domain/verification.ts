import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { emailSender } from '../lib/email.js';
import { getResendState, incrementResendCounter } from '../lib/redis.js';
import { writeOutbox } from '../lib/outbox.js';

// BR-ACC-05
export const VERIFICATION_TTL_MIN = 15;
export const MAX_RESENDS_PER_HOUR = 3;

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** ACC-02 — Xác minh email (AC-ACC-02-1..3, 5). */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    throw new AppError('INVALID_CODE', 'Mã xác minh không đúng hoặc đã hết hạn.', 400);
  }

  const now = new Date();
  const verification = await prisma.verification.findFirst({
    where: {
      userId: user.id,
      channel: 'email',
      code,
      consumedAt: null,
      expiresAt: { gt: now },
    },
  });
  if (!verification) {
    throw new AppError('INVALID_CODE', 'Mã xác minh không đúng hoặc đã hết hạn.', 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.verification.update({
      where: { id: verification.id },
      data: { consumedAt: now },
    });
    await tx.user.update({ where: { id: user.id }, data: { verified: true } });
    // AC-ACC-02-1: phát UserRegistered đúng một lần — ghi Outbox trong cùng
    // transaction, relay publish RabbitMQ đúng một lần (finance tạo ví ở G4).
    await writeOutbox(tx, {
      aggregateType: 'User',
      aggregateId: user.id,
      eventType: 'UserRegistered',
      payload: { userId: user.id, email: user.email },
    });
  });
}

/** ACC-02 luồng thay thế — gửi lại mã (AC-ACC-02-4). Không tính lần gửi đầu
 * lúc đăng ký, chỉ tính hành động gửi lại — tối đa 3 lần/giờ (BR-ACC-05). */
export async function resendVerificationCode(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    // Không có tài khoản nào tương ứng — coi như đã "gửi" để không lộ thông tin.
    return;
  }
  if (user.verified) return; // đã xác minh rồi thì không còn gì để gửi lại

  const { count, retryAfterSec } = await getResendState(user.id);
  if (count >= MAX_RESENDS_PER_HOUR) {
    throw new AppError(
      'RESEND_LIMIT_EXCEEDED',
      'Đã gửi lại mã tối đa 3 lần trong 1 giờ. Vui lòng thử lại sau.',
      429,
      { retryAfterSec },
    );
  }

  const code = generateVerificationCode();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Vô hiệu mã cũ (đã có trong bộ nhớ người dùng nhưng không còn dùng được).
    await tx.verification.updateMany({
      where: { userId: user.id, channel: 'email', consumedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    await tx.verification.create({
      data: {
        userId: user.id,
        channel: 'email',
        code,
        expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MIN * 60_000),
      },
    });
  });
  await incrementResendCounter(user.id);

  try {
    await emailSender.send(normalizedEmail, 'Mã xác minh tài khoản (gửi lại)', `Mã xác minh mới: ${code}`);
  } catch {
    // Nuốt lỗi gửi email có chủ đích, giống ACC-01.
  }
}
