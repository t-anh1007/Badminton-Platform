import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { signAccessToken, signRefreshToken } from '../lib/jwt.js';
import { storeRefreshToken } from '../lib/redis.js';
import { writeOutbox } from '../lib/outbox.js';
import { AppError } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { DEMO_USER_ID } from '@khoaluantn/shared';
import type { LoginResult } from './session.js';

/** Cổng "Test demo" — đăng nhập nhanh vào một tài khoản người chơi dùng chung,
 * dành cho người muốn trải nghiệm hệ thống mà không cần tạo/lộ tài khoản thật
 * (ví dụ HR chấm demo). Tài khoản demo được tạo tự động lần đầu (idempotent) nên
 * chạy được ngay trên prod không cần seed thủ công. Tắt được qua DEMO_LOGIN_ENABLED. */
export async function demoLogin(): Promise<LoginResult> {
  if (!env.demoLoginEnabled) {
    throw new AppError('DEMO_DISABLED', 'Cổng đăng nhập demo đang tắt.', 403);
  }

  const email = env.demoEmail;
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Mật khẩu ngẫu nhiên không lộ ra ngoài — chỉ vào được qua nút demo này,
    // không đăng nhập được bằng /auth/login vì không ai biết mật khẩu.
    const passwordHash = await hashPassword(`demo-${Date.now()}-${Math.random().toString(36).slice(2)}A1`);
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        // ID cố định để mọi service nhận ra cùng một tài khoản vãng lai.
        data: { id: DEMO_USER_ID, email, passwordHash, roles: ['player'], verified: true },
      });
      await tx.playerProfile.create({ data: { userId: created.id, displayName: 'Khách demo' } });
      // Phát UserRegistered để finance cấp ví cá nhân (giống luồng xác minh thật).
      await writeOutbox(tx, {
        aggregateType: 'User',
        aggregateId: created.id,
        eventType: 'UserRegistered',
        payload: { userId: created.id, email },
      });
      return created;
    });
  } else if (user.status === 'locked') {
    // Tài khoản demo dùng chung không nên bị kẹt ở trạng thái khóa.
    user = await prisma.user.update({ where: { id: user.id }, data: { status: 'active' } });
  }

  const roles = user.roles as string[];
  const accessToken = signAccessToken(user.id, roles);
  const { token: refreshToken, jti } = signRefreshToken(user.id);
  await storeRefreshToken(user.id, jti, env.refreshTokenTtlSec);

  return { accessToken, refreshToken, roles };
}
