import { prisma } from '../lib/prisma.js';

interface ProviderApprovedPayload {
  providerId: string;
  userId: string;
}

/** D25 (AC-VEN-02-1/02-4) — Consumer ProviderApproved: cộng vai `provider` cho
 * tài khoản khi NCC được duyệt (VEN-02). Nhất quán D3: vai trò là TẬP HỢP,
 * người dùng luôn giữ `player`, `provider` cộng thêm — không thay thế. Idempotent
 * qua ProcessedEvent VÀ qua chính phép hợp tập (cộng lại vai đã có không đổi gì).
 *
 * Đây là CONSUMER ĐẦU TIÊN của account-service (trước G4 chỉ publish). */
export async function grantProviderRole(eventId: string, payload: ProviderApprovedPayload): Promise<void> {
  const already = await prisma.processedEvent.findUnique({ where: { eventId } });
  if (already) return;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: payload.userId } });
    if (user && !user.roles.includes('provider')) {
      await tx.user.update({
        where: { id: payload.userId },
        data: { roles: { set: [...user.roles, 'provider'] } },
      });
    }
    await tx.processedEvent.create({ data: { eventId } });
  });
}
