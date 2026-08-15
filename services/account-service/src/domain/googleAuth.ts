import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/prisma.js';
import { signAccessToken, signRefreshToken } from '../lib/jwt.js';
import { storeRefreshToken } from '../lib/redis.js';
import { AppError } from '../lib/errors.js';
import { env } from '../lib/env.js';
import type { LoginResult } from './session.js';

const client = new OAuth2Client(env.googleOauthClientId);

interface GooglePayload {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

async function verifyGoogleIdToken(idToken: string): Promise<GooglePayload> {
  if (!env.googleOauthClientId) {
    throw new AppError('GOOGLE_OAUTH_NOT_CONFIGURED', 'Đăng nhập Google chưa được cấu hình.', 503);
  }
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.googleOauthClientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AppError('INVALID_GOOGLE_TOKEN', 'Token Google không hợp lệ.', 401);
  }
  if (!payload?.sub || !payload.email) {
    throw new AppError('INVALID_GOOGLE_TOKEN', 'Token Google không hợp lệ.', 401);
  }
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: payload.name ?? undefined,
    picture: payload.picture ?? undefined,
  };
}

/** ACC-Google — Đăng nhập/Đăng ký bằng Google ID token. Auto-link khi email đã verified. */
export async function loginWithGoogle(idToken: string): Promise<LoginResult> {
  const g = await verifyGoogleIdToken(idToken);

  // 1) Đã có user với google_sub → login.
  let user = await prisma.user.findUnique({ where: { googleSub: g.sub } });

  // 2) Chưa có → tìm theo email; nếu Google đã verify email thì auto-link.
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email: g.email } });
    if (byEmail) {
      if (!g.emailVerified) {
        throw new AppError(
          'GOOGLE_EMAIL_NOT_VERIFIED',
          'Google chưa xác minh email này. Vui lòng đăng nhập bằng mật khẩu.',
          409,
        );
      }
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { googleSub: g.sub, verified: true },
      });
      if (g.picture) {
        await prisma.playerProfile.updateMany({
          where: { userId: user.id, avatarUrl: null },
          data: { avatarUrl: g.picture },
        });
      }
    }
  }

  // 3) Vẫn không có → tạo user mới, role player, đã verified.
  if (!user) {
    const displayName = (g.name?.trim() || g.email.split('@')[0] || 'Người chơi').slice(0, 80);
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: g.email,
          googleSub: g.sub,
          roles: ['player'],
          verified: true,
        },
      });
      await tx.playerProfile.create({
        data: {
          userId: created.id,
          displayName,
          avatarUrl: g.picture ?? null,
        },
      });
      return created;
    });
  }

  if (user.status === 'locked') {
    throw new AppError('ACCOUNT_LOCKED', 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.', 403);
  }

  const roles = user.roles as string[];
  const accessToken = signAccessToken(user.id, roles);
  const { token: refreshToken, jti } = signRefreshToken(user.id);
  await storeRefreshToken(user.id, jti, env.refreshTokenTtlSec);
  return { accessToken, refreshToken, roles };
}
