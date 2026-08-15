import { prisma } from '../lib/prisma.js';
import { getOrCreateWallet } from './wallet.js';

interface UserRegisteredPayload {
  userId: string;
  email: string;
}

/** AC-ACC-02-5 (blocked từ G1) — Consumer UserRegistered: tạo ví `personal`
 * số dư 0 cho người dùng vừa xác minh email. Idempotent qua ProcessedEvent —
 * event phát lại không tạo ví trùng (unique [userId, walletType] cũng chặn
 * ở tầng CSDL, nhưng kiểm tra ProcessedEvent trước để tránh race không cần
 * thiết và nhất quán với các consumer khác). */
export async function handleUserRegistered(eventId: string, payload: UserRegisteredPayload): Promise<void> {
  const already = await prisma.processedEvent.findUnique({ where: { eventId } });
  if (already) return;

  await prisma.$transaction(async (tx) => {
    await getOrCreateWallet(tx, payload.userId, 'personal');
    await tx.processedEvent.create({ data: { eventId } });
  });
}

interface ProviderApprovedPayload {
  providerId: string;
  userId: string;
}

/** D25 (AC-VEN-02-1) — Consumer ProviderApproved: tạo ví `business` rỗng cho
 * NCC vừa được duyệt. Không còn lazy-creation (G4 cũ tạo ví khi có doanh thu
 * đầu tiên) — NCC chưa có booking vẫn thấy ví business (đóng AC-FIN-01-2).
 * Idempotent qua ProcessedEvent. */
export async function handleProviderApproved(eventId: string, payload: ProviderApprovedPayload): Promise<void> {
  const already = await prisma.processedEvent.findUnique({ where: { eventId } });
  if (already) return;

  await prisma.$transaction(async (tx) => {
    await getOrCreateWallet(tx, payload.userId, 'business');
    await tx.processedEvent.create({ data: { eventId } });
  });
}
