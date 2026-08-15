import { Redis } from 'ioredis';
import { env } from './env.js';

export const redis = new Redis(env.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });

// --- Refresh token allowlist (BR-ACC-07/13, ACC-04) ---
// Token blacklist/allowlist ở Redis, không ở DB (data-model.md).
const refreshKey = (jti: string) => `refresh:${jti}`;
const userTokensKey = (userId: string) => `user:${userId}:refresh-tokens`;

export async function storeRefreshToken(userId: string, jti: string, ttlSec: number): Promise<void> {
  await redis.set(refreshKey(jti), userId, 'EX', ttlSec);
  await redis.sadd(userTokensKey(userId), jti);
  await redis.expire(userTokensKey(userId), ttlSec);
}

export async function isRefreshTokenValid(jti: string): Promise<boolean> {
  const v = await redis.get(refreshKey(jti));
  return v !== null;
}

export async function revokeRefreshToken(jti: string): Promise<void> {
  const userId = await redis.get(refreshKey(jti));
  await redis.del(refreshKey(jti));
  if (userId) await redis.srem(userTokensKey(userId), jti);
}

/** Thu hồi toàn bộ refresh token của user. BR-ACC-07 (đặt lại mk), BR-ACC-09 (khóa). */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  const jtis = await redis.smembers(userTokensKey(userId));
  if (jtis.length > 0) {
    await redis.del(...jtis.map(refreshKey));
  }
  await redis.del(userTokensKey(userId));
}

/** Thu hồi mọi thiết bị khác, giữ lại jti hiện tại. BR-ACC-13 (đổi mật khẩu). */
export async function revokeOtherRefreshTokens(userId: string, keepJti: string): Promise<void> {
  const jtis = await redis.smembers(userTokensKey(userId));
  const toRevoke = jtis.filter((j: string) => j !== keepJti);
  if (toRevoke.length > 0) {
    await redis.del(...toRevoke.map(refreshKey));
    await redis.srem(userTokensKey(userId), ...toRevoke);
  }
}

// --- Login lockout (BR-ACC-08) ---
const loginFailKey = (email: string) => `loginfail:${email}`;
const loginLockKey = (email: string) => `loginlock:${email}`;
const FAIL_WINDOW_SEC = 15 * 60;
const LOCK_DURATION_SEC = 15 * 60;
const MAX_FAILS = 5;

/** Trả về số giây còn lại nếu đang bị khóa tạm, hoặc null nếu không khóa. */
export async function getLoginLockRemainingSec(email: string): Promise<number | null> {
  const ttl = await redis.ttl(loginLockKey(email));
  return ttl > 0 ? ttl : null;
}

export async function recordLoginFailure(email: string): Promise<void> {
  const count = await redis.incr(loginFailKey(email));
  if (count === 1) await redis.expire(loginFailKey(email), FAIL_WINDOW_SEC);
  if (count >= MAX_FAILS) {
    await redis.set(loginLockKey(email), '1', 'EX', LOCK_DURATION_SEC);
  }
}

export async function clearLoginFailures(email: string): Promise<void> {
  await redis.del(loginFailKey(email));
}

// --- Resend-code rate limit (BR-ACC-05: tối đa 3 lần GỬI LẠI / 1 giờ) ---
// Không tính mã gửi lần đầu lúc đăng ký — chỉ tính hành động "gửi lại".
const resendKey = (userId: string) => `verify-resend:${userId}`;
const RESEND_WINDOW_SEC = 60 * 60;

export async function getResendState(userId: string): Promise<{ count: number; retryAfterSec: number }> {
  const [count, ttl] = await Promise.all([redis.get(resendKey(userId)), redis.ttl(resendKey(userId))]);
  return { count: count ? Number(count) : 0, retryAfterSec: ttl > 0 ? ttl : 0 };
}

export async function incrementResendCounter(userId: string): Promise<void> {
  const count = await redis.incr(resendKey(userId));
  if (count === 1) await redis.expire(resendKey(userId), RESEND_WINDOW_SEC);
}
