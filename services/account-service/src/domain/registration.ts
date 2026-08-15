import { prisma } from '../lib/prisma.js';
import { hashPassword, isPasswordPolicyValid } from '../lib/password.js';
import { AppError } from '../lib/errors.js';
import { emailSender } from '../lib/email.js';
import { generateVerificationCode, VERIFICATION_TTL_MIN } from './verification.js';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
}

/** ACC-01 — Đăng ký tài khoản (AC-ACC-01-1..4). */
export async function registerUser(input: RegisterInput): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase();

  // BR-ACC-04
  if (!isPasswordPolicyValid(input.password)) {
    throw new AppError(
      'WEAK_PASSWORD',
      'Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ và số.',
      400,
    );
  }
  if (!input.displayName.trim()) {
    throw new AppError('DISPLAY_NAME_REQUIRED', 'Tên hiển thị không được để trống.', 400);
  }

  // BR-ACC-01: email chưa tồn tại (kiểm tra trước, dù transaction bên dưới
  // cũng chặn qua @@unique — check sớm để trả lỗi rõ ràng, không tạo bản ghi
  // dở dang nào).
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError('EMAIL_TAKEN', 'Email đã được sử dụng.', 409);
  }

  const passwordHash = await hashPassword(input.password);
  const code = generateVerificationCode();

  const { userId } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        phone: input.phone,
        passwordHash,
        roles: ['player'],
        verified: false,
      },
    });
    await tx.playerProfile.create({
      data: { userId: user.id, displayName: input.displayName },
    });
    await tx.verification.create({
      data: {
        userId: user.id,
        channel: 'email',
        code,
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MIN * 60_000),
      },
    });
    return { userId: user.id };
  });

  // Luồng lỗi ACC-01: gửi email thất bại KHÔNG rollback tài khoản đã tạo.
  try {
    await emailSender.send(email, 'Mã xác minh tài khoản Courtin', `Mã xác minh của bạn là: ${code}\n\nMã có hiệu lực trong ${VERIFICATION_TTL_MIN} phút.`);
  } catch (err) {
    // Nuốt lỗi gửi email có chủ đích — tài khoản vẫn tồn tại, người dùng bấm
    // "gửi lại mã" ở ACC-02. Log để chẩn đoán khi SMTP fail trên prod.
    // eslint-disable-next-line no-console
    console.error('[registration] SMTP send failed:', err instanceof Error ? err.message : err);
  }

  return { userId };
}
