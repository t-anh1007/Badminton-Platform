import { Redis } from 'ioredis';

/**
 * Danh sách tài khoản đang bị khóa, dùng chung qua Redis (PO 03/10/2026: khóa là ngắt NGAY mọi phiên,
 * không chờ access token 15 phút hết hạn). account-service ghi/xóa key; mọi service đọc ở requireAuth.
 * Redis lỗi/không cấu hình → CHO QUA (fail-open, có log) để hệ thống không chết theo Redis.
 */
const key = (userId: string) => `account-locked:${userId}`;
let client: Redis | null | undefined;

function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL;
  client = url
    ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, commandTimeout: 500, enableOfflineQueue: false })
    : null;
  if (!client) console.warn('[account-lock] REDIS_URL chưa cấu hình: bỏ qua kiểm tra khóa tức thì');
  client?.on('error', () => undefined);
  return client;
}

export async function isAccountLocked(userId: string): Promise<boolean> {
  const r = redis();
  if (!r) return false;
  try {
    if (r.status === 'wait' || r.status === 'end') await r.connect();
    return (await r.exists(key(userId))) === 1;
  } catch (error) {
    console.warn('[account-lock] Redis không phản hồi, cho qua:', (error as Error).message);
    return false;
  }
}

/** Kết nối realtime giữ lâu (SSE/socket): kiểm định kỳ, khóa thì gọi onLocked để cắt kết nối. Trả hàm dừng. */
export function watchAccountLock(userId: string, onLocked: () => void, intervalMs = 15_000): () => void {
  const timer = setInterval(() => {
    void isAccountLocked(userId).then((locked) => {
      if (!locked) return;
      clearInterval(timer);
      onLocked();
    });
  }, intervalMs);
  return () => clearInterval(timer);
}

/** account-service: gọi sau khi khóa/mở khóa thành công. Lỗi ném ra để nơi gọi quyết định. */
export async function setAccountLocked(userId: string, locked: boolean): Promise<void> {
  const r = redis();
  if (!r) return;
  if (r.status === 'wait' || r.status === 'end') await r.connect();
  if (locked) await r.set(key(userId), '1');
  else await r.del(key(userId));
}
