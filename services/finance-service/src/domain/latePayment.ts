import { prisma } from '../lib/prisma.js';
import { getOrCreateWallet, postLedgerEntry } from './wallet.js';

export interface PaymentTooLatePayload {
  bookingId: string;
  userId: string | null;
  amount: string;
}

/** FIN-06 / BR-BOK-04 — Consumer `PaymentTooLate` (venue-booking-service
 * phát khi `PaymentCompleted` tới sau lúc hold đã hết hạn, xem
 * venue-booking-service/src/lib/eventConsumer.ts). Ghi có ví `personal`
 * TOÀN BỘ số tiền, KHÔNG phục hồi booking (venue-booking-service đã tự lo
 * việc đó). Idempotent qua ProcessedEvent. */
export async function creditLatePayment(eventId: string, payload: PaymentTooLatePayload): Promise<void> {
  const already = await prisma.processedEvent.findUnique({ where: { eventId } });
  if (already) return;
  if (!payload.userId) {
    // Booking nội bộ (không userId) không thể xảy ra ở nhánh này trong thực
    // tế (chỉ marketplace booking mới thanh toán qua finance) — bỏ qua an toàn.
    await prisma.processedEvent.create({ data: { eventId } });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(tx, payload.userId, 'personal');
    await postLedgerEntry(tx, {
      walletId: wallet.id,
      amount: BigInt(payload.amount),
      type: 'topup',
      refType: 'late_payment', // AC-FIN-06-3: lịch sử nêu rõ tiền về muộn
      refId: payload.bookingId,
    });
    await tx.processedEvent.create({ data: { eventId } });
  });
}
