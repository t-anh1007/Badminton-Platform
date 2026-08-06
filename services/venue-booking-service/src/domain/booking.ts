import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { calculateBookingPrice } from './pricing.js';
import { CANCELLATION_POLICY, getRefundPercentageFromSnapshot } from './cancellationPolicy.js';

/** BOK-07 bước 1 — Tạo `BOOKING(status=held)` gắn với một hold hợp lệ, chốt
 * `priceSnapshot` + `policySnapshot` (BR-BOK-06), rồi xóa hold. Phương thức
 * thanh toán KHÔNG phải business logic của service này — FE gọi tiếp
 * finance-service (FIN-03/04) bằng `bookingId` trả về. */
export async function createBookingFromHold(userId: string, holdId: string) {
  const hold = await prisma.hold.findUnique({ where: { id: holdId } });
  if (!hold || hold.userId !== userId) {
    throw new AppError('HOLD_NOT_FOUND', 'Không tìm thấy lượt giữ chỗ của bạn.', 404);
  }
  if (hold.expiresAt.getTime() <= Date.now()) {
    throw new AppError('HOLD_EXPIRED', 'Lượt giữ chỗ đã hết hạn.', 409);
  }

  const priceSnapshot = await calculateBookingPrice(hold.courtId, hold.startAt, hold.endAt);

  // KHÔNG xóa hold ở đây (sửa lỗi P1 Codex): spec BOK-07 xóa hold ở BƯỚC XÁC
  // NHẬN (bước 5), không phải lúc tạo booking. Xóa sớm mở lại slot ngay lập tức
  // -> người thứ hai tạo được hold trùng và trả tiền trong khi người thứ nhất
  // vẫn đang trả -> hai người cùng thanh toán một slot. Giữ hold thì EXCLUDE
  // constraint trên `holds` chặn người thứ hai suốt cửa sổ 10 phút. Hold được
  // xóa khi PaymentCompleted -> confirmed (eventConsumer.handlePaymentCompleted),
  // hoặc bị reap khi hết hạn (reapExpiredHolds).
  return prisma.booking.create({
    data: {
      courtId: hold.courtId,
      startAt: hold.startAt,
      endAt: hold.endAt,
      userId,
      source: 'marketplace',
      status: 'held',
      priceSnapshot,
      policySnapshot: CANCELLATION_POLICY,
      holdExpiresAt: hold.expiresAt,
    },
  });
}

/** true nếu booking đang `held` VÀ chưa qua mốc hết hạn của hold gốc — điều
 * kiện duy nhất để `PaymentCompleted` được phép xác nhận (BR-BOK-04). */
function isStillPayable(booking: { status: string; holdExpiresAt: Date | null }): boolean {
  return booking.status === 'held' && !!booking.holdExpiresAt && booking.holdExpiresAt.getTime() > Date.now();
}

/** API nội bộ cho finance-service hỏi trước khi ghi bút toán (FIN-03 cần
 * quyết định NGAY trong luồng đồng bộ; FIN-04/06 dùng theo flows.md §5:
 * "Hỏi venue-booking-service booking còn hold không?"). Tự chuyển
 * `held` quá hạn -> `cancelled` NGAY tại đây (self-healing, cùng kiểu với
 * reap hold ở G3) để câu trả lời luôn phản ánh trạng thái mới nhất. */
export async function getPaymentStatus(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);

  if (booking.status === 'held' && !isStillPayable(booking)) {
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } });
    booking.status = 'cancelled';
  }

  return {
    bookingId: booking.id,
    userId: booking.userId,
    status: booking.status,
    gross: booking.priceSnapshot.toString(),
    stillPayable: isStillPayable(booking),
  };
}

/** AC-BOK-07-5 — tác vụ nền quét booking `held` quá hạn hold -> `cancelled`,
 * slot trở lại khả dụng (không còn hold VÀ không còn booking held chặn chỗ). */
export async function reapExpiredHeldBookings(): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: { status: 'held', holdExpiresAt: { lte: new Date() } },
    data: { status: 'cancelled' },
  });
  return result.count;
}

/** BOK-08 — booking của chính người chơi (không gồm booking nội bộ, AC-08-5). */
export async function listMyBookings(userId: string) {
  const bookings = await prisma.booking.findMany({
    where: { userId, source: 'marketplace' },
    orderBy: { startAt: 'desc' },
    include: { court: { include: { venue: true } } },
  });
  const now = Date.now();
  return {
    upcoming: bookings.filter((b) => b.startAt.getTime() >= now),
    past: bookings.filter((b) => b.startAt.getTime() < now),
  };
}

/** AC-08-2/3/4: chi tiết một booking — CHỈ chủ booking mới xem được. */
export async function getMyBookingDetail(userId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.source !== 'marketplace') {
    throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);
  }
  if (booking.userId !== userId) {
    throw new AppError('FORBIDDEN', 'Không có quyền xem booking này.', 403); // BR-BOK-10
  }
  const hoursUntilStart = (booking.startAt.getTime() - Date.now()) / 3_600_000;
  // BR-BOK-06: đọc từ policySnapshot của CHÍNH booking, không phải hằng hiện hành.
  return { booking, expectedRefundPercent: getRefundPercentageFromSnapshot(booking.policySnapshot, hoursUntilStart) };
}
