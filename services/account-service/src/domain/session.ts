import { prisma } from '../lib/prisma.js';
import { verifyPassword } from '../lib/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import {
  clearLoginFailures,
  getLoginLockRemainingSec,
  isRefreshTokenValid,
  recordLoginFailure,
  revokeRefreshToken,
  storeRefreshToken,
} from '../lib/redis.js';
import { AppError, GENERIC_AUTH_ERROR } from '../lib/errors.js';
import { env } from '../lib/env.js';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  roles: string[];
}

// Hash cố định dùng để so sánh "giả" khi email không tồn tại — giữ thời gian
// phản hồi gần giống trường hợp có tài khoản (BR-ACC-10).
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8g/hOTn/8UEXBS0/AVsFQE0k4X2WY.';

/** ACC-03 — Đăng nhập (AC-ACC-03-1..6). */
export async function login(email: string, password: string): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();

  // BR-ACC-08 — khóa tạm áp dụng TRƯỚC khi kiểm mật khẩu (AC-ACC-03-5: "kể cả
  // với mật khẩu đúng").
  const lockRemaining = await getLoginLockRemainingSec(normalizedEmail);
  if (lockRemaining !== null) {
    throw new AppError('LOGIN_TEMP_LOCKED', 'Tài khoản tạm khóa do sai mật khẩu nhiều lần.', 429, {
      retryAfterSec: lockRemaining,
    });
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  // AC-ACC-03-4: email không tồn tại phải báo lỗi giống hệt sai mật khẩu.
  if (!user || !passwordOk) {
    await recordLoginFailure(normalizedEmail);
    throw new AppError('INVALID_CREDENTIALS', GENERIC_AUTH_ERROR, 401);
  }

  // BR-ACC-03: chưa xác minh không đăng nhập được.
  if (!user.verified) {
    throw new AppError('EMAIL_NOT_VERIFIED', 'Tài khoản chưa xác minh email.', 403);
  }
  // BR-ACC-09/12: tài khoản bị khóa vô thời hạn.
  if (user.status === 'locked') {
    throw new AppError('ACCOUNT_LOCKED', 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.', 403);
  }

  await clearLoginFailures(normalizedEmail);

  const roles = user.roles as string[];
  const accessToken = signAccessToken(user.id, roles);
  const { token: refreshToken, jti } = signRefreshToken(user.id);
  await storeRefreshToken(user.id, jti, env.refreshTokenTtlSec);

  return { accessToken, refreshToken, roles };
}

/** ACC-04 — Đăng xuất (AC-ACC-04-1..2). Luôn trả thành công kể cả token đã
 * hết hạn/thu hồi — không parse lỗi ra ngoài. */
export async function logout(refreshToken: string): Promise<void> {
  try {
    const { jti } = verifyRefreshToken(refreshToken);
    await revokeRefreshToken(jti);
  } catch {
    // Token không hợp lệ/đã hết hạn — vẫn coi là đăng xuất thành công (AC-04-2).
  }
}

export async function refreshSession(refreshToken: string): Promise<LoginResult> {
  let payload: { sub: string; jti: string }
  try { payload = verifyRefreshToken(refreshToken) } catch { throw new AppError('INVALID_REFRESH_TOKEN', 'Phiên đăng nhập không còn hợp lệ.', 401) }
  if (!(await isRefreshTokenValid(payload.jti))) throw new AppError('INVALID_REFRESH_TOKEN', 'Phiên đăng nhập không còn hợp lệ.', 401)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } })
  if (user.status === 'locked') throw new AppError('ACCOUNT_LOCKED', 'Tài khoản đã bị khóa.', 403)
  const roles = user.roles as string[]
  return { accessToken: signAccessToken(user.id, roles), refreshToken, roles }
}
