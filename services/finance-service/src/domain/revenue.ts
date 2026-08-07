import { prisma } from '../lib/prisma.js';
import { ensurePlatformWallet, getOrCreateWallet, postLedgerEntry } from './wallet.js';
import { COMMISSION_RATE_PERCENT } from '../lib/constants.js';
import { z } from 'zod';

export interface BookingConfirmedPayload {
  bookingId: string;
  /** Chủ sở hữu ví business — venue-booking-service phải kèm theo vì
   * finance-service không truy vấn được schema của service khác (D17). */
  businessUserId: string;
  /** BigInt tuần tự hóa qua JSON dạng chuỗi thập phân. */
  gross: string;
  venueId: string;
  endAt: string;
  source: 'marketplace' | 'internal';
}

const bookingConfirmedSchema = z.object({
  bookingId: z.string().uuid(),
  businessUserId: z.string().uuid(),
  gross: z.string().regex(/^[1-9]\d*$/),
  venueId: z.string().uuid(),
  endAt: z.string().datetime(),
  source: z.enum(['marketplace', 'internal']),
});

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
export async function recordBookingRevenue(eventId: string, rawPayload: BookingConfirmedPayload): Promise<void> {
  const payload = bookingConfirmedSchema.parse(rawPayload);
  // Tạo singleton ngoài transaction ghi doanh thu để P2002 do hai event đầu
  // cùng lúc không làm abort transaction chứa các bút toán ba vế.
  if (payload.source === 'marketplace') await ensurePlatformWallet();
  const gross = BigInt(payload.gross);
  // Chia nguyên bằng BigInt — net = gross - commission đảm bảo net+commission
  // LUÔN đúng bằng gross tuyệt đối (không phụ thuộc làm tròn), đúng BR-FIN-15.
  const commission = (gross * COMMISSION_RATE_PERCENT) / 100n;
  const net = gross - commission;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${payload.bookingId}))) AS booking_lock`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    if (payload.source === 'internal') {
      await tx.processedEvent.create({ data: { eventId } });
      return;
    }
    // FIN-09 yêu cầu idempotent theo booking, kể cả upstream phát event id mới.
    if (await tx.bookingRevenue.findUnique({ where: { bookingId: payload.bookingId } })) {
      await tx.processedEvent.create({ data: { eventId } });
      return;
    }
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
    const endAt = new Date(payload.endAt);
    if (Number.isNaN(endAt.getTime())) throw new Error('BookingConfirmed endAt không hợp lệ');
    await tx.bookingRevenue.create({
      data: {
        bookingId: payload.bookingId,
        businessWalletId: businessWallet.id,
        businessUserId: payload.businessUserId,
        venueId: payload.venueId,
        gross,
        net,
        commission,
        endAt,
        releaseAt: new Date(endAt.getTime() + 24 * 3_600_000),
      },
    });

    await tx.processedEvent.create({ data: { eventId } });
  });
}
