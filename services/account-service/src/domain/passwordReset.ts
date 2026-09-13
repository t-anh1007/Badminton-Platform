import { randomBytes, randomInt } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { hashPassword, isPasswordPolicyValid, verifyPassword } from '../lib/password.js';
import { AppError } from '../lib/errors.js';
import { emailSender } from '../lib/email.js';
import { revokeAllRefreshTokens, revokeOtherRefreshTokens } from '../lib/redis.js';
import { verifyRefreshToken } from '../lib/jwt.js';

const RESET_CODE_TTL_MIN = 5;
function generateResetCode(): string { return randomInt(0, 1_000_000).toString().padStart(6, '0'); }

/** ACC-05 (bước 1) — Yêu cầu đặt lại mật khẩu (AC-ACC-05-1..2). */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  // BR-ACC-10: không tiết lộ email có tồn tại hay không — im lặng nếu không có.
  if (!user) return;

  const code = generateResetCode();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Luồng thay thế: yêu cầu lần hai vô hiệu token cũ ngay (AC-ACC-05-5).
    await tx.passwordReset.updateMany({
      where: { userId: user.id, consumedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    await tx.passwordReset.create({
      data: {
        userId: user.id,
        token: code,
        expiresAt: new Date(now.getTime() + RESET_CODE_TTL_MIN * 60_000),
      },
    });
  });

  try {
    await emailSender.send(
      normalizedEmail,
      'Mã đặt lại mật khẩu',
      `Mã đặt lại mật khẩu của bạn là: ${code}\n\nMã có hiệu lực trong ${RESET_CODE_TTL_MIN} phút.`,
    );
  } catch (err) {
    // Không tiết lộ email có tồn tại qua response, nhưng phải giữ bằng chứng
    // vận hành để lỗi nhà cung cấp email không bị biến thành thành công giả.
    // eslint-disable-next-line no-console
    console.error('[password-reset] Email send failed:', err instanceof Error ? err.message : err);
  }
}

export async function verifyPasswordResetCode(email: string, code: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase(); const now = new Date();
  const reset = await prisma.passwordReset.findFirst({ where: { token: code, consumedAt: null, expiresAt: { gt: now }, user: { email: normalizedEmail } } });
  if (!reset) throw new AppError('INVALID_RESET_CODE', 'Mã xác nhận không hợp lệ hoặc đã hết hạn.', 400);
  const resetToken = randomBytes(32).toString('hex');
  const updated = await prisma.passwordReset.updateMany({ where: { id: reset.id, token: code, consumedAt: null, expiresAt: { gt: now } }, data: { token: resetToken } });
  if (updated.count !== 1) throw new AppError('INVALID_RESET_CODE', 'Mã xác nhận không hợp lệ hoặc đã hết hạn.', 400);
  return resetToken;
}

/** ACC-05 (bước 2) — Hoàn tất đặt lại mật khẩu (AC-ACC-05-3..4). */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!isPasswordPolicyValid(newPassword)) {
    throw new AppError('WEAK_PASSWORD', 'Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ và số.', 400);
  }

  const now = new Date();
  const reset = await prisma.passwordReset.findFirst({
    where: { token, consumedAt: null, expiresAt: { gt: now } },
  });
  if (!reset) {
    throw new AppError('INVALID_RESET_TOKEN', 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.', 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.passwordReset.update({ where: { id: reset.id }, data: { consumedAt: now } });
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
  });

  // BR-ACC-07: thu hồi TOÀN BỘ refresh token, kể cả phiên vừa dùng để đặt lại.
  await revokeAllRefreshTokens(reset.userId);
}

/** ACC-06 — Đổi mật khẩu khi đang đăng nhập (AC-ACC-06-1..3). */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentRefreshToken?: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash) {
    throw new AppError('NO_PASSWORD_SET', 'Tài khoản đăng nhập bằng Google chưa đặt mật khẩu.', 400);
  }

  const currentOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentOk) {
    throw new AppError('INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không đúng.', 401);
  }
  if (!isPasswordPolicyValid(newPassword)) {
    throw new AppError('WEAK_PASSWORD', 'Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ và số.', 400);
  }
  const samePassword = await verifyPassword(newPassword, user.passwordHash);
  if (samePassword) {
    throw new AppError('SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu cũ.', 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  // BR-ACC-13: thu hồi các thiết bị KHÁC, giữ lại phiên hiện tại.
  if (currentRefreshToken) {
    try {
      const { jti } = verifyRefreshToken(currentRefreshToken);
      await revokeOtherRefreshTokens(userId, jti);
      return;
    } catch {
      // Refresh token gửi kèm không hợp lệ — rơi xuống thu hồi toàn bộ bên dưới.
    }
  }
  await revokeAllRefreshTokens(userId);
}
