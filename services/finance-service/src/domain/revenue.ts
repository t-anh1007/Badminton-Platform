import { prisma } from '../lib/prisma.js';
import { getOrCreateWallet, postLedgerEntry } from './wallet.js';
import { COMMISSION_RATE_PERCENT } from '../lib/constants.js';

export interface BookingConfirmedPayload {
  bookingId: string;
  /** Chủ sở hữu ví business — venue-booking-service phải kèm theo vì
   * finance-service không truy vấn được schema của service khác (D17). */
  businessUserId: string;
  /** BigInt tuần tự hóa qua JSON dạng chuỗi thập phân. */
  gross: string;
}

/** FIN-09 (phần G4, AC-FIN-09-1..3) — Consumer BookingConfirmed: ghi doanh
 * thu chủ sân vào `pending` (chờ hết cửa sổ tranh chấp — phần đáo hạn thuộc
 * G6) cộng hoa hồng nền tảng vào ví `platform`, TRONG CÙNG một transaction —
 * đúng BA VẾ CÂN BẰNG (AC-FIN-09-2): người chơi đã trả gross ở FIN-03/04,
 * chủ sân nhận gross×(1-r) (pending), platform nhận gross×r.
 *
 * Ví business bình thường ĐÃ được tạo khi duyệt NCC (D25, consumer
 * ProviderApproved). `getOrCreateWallet` ở đây chỉ là lưới an toàn phòng khi
 * doanh thu tới trước khi ví kịp tạo (thứ tự event) — không phải nguồn tạo ví
 * chính. */
export async function recordBookingRevenue(eventId: string, payload: BookingConfirmedPayload): Promise<void> {
  const already = await prisma.processedEvent.findUnique({ where: { eventId } });
  if (already) return; // AC-FIN-09-3: idempotent khi BookingConfirmed phát lại

  const gross = BigInt(payload.gross);
  // Chia nguyên bằng BigInt — net = gross - commission đảm bảo net+commission
  // LUÔN đúng bằng gross tuyệt đối (không phụ thuộc làm tròn), đúng BR-FIN-15.
  const commission = (gross * COMMISSION_RATE_PERCENT) / 100n;
  const net = gross - commission;

  await prisma.$transaction(async (tx) => {
    const businessWallet = await getOrCreateWallet(tx, payload.businessUserId, 'business');
    const platformWallet = await getOrCreateWallet(tx, null, 'platform');

    await postLedgerEntry(tx, {
      walletId: businessWallet.id,
      amount: net,
      type: 'release',
      refType: 'booking',
      refId: payload.bookingId,
      field: 'pending',
    });
    await postLedgerEntry(tx, {
      walletId: platformWallet.id,
      amount: commission,
      type: 'commission',
      refType: 'booking',
      refId: payload.bookingId,
      field: 'available',
    });

    await tx.processedEvent.create({ data: { eventId } });
  });
}
