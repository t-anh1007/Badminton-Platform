import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { calculateBookingPrice } from './pricing.js';
import { lockCourtSchedule } from '../lib/courtScheduleLock.js';
import { assertCourtAcceptsCommitment } from './operationalShutdown.js';
import { isRangeClosed } from './slotAvailability.js';

async function getOwnedCourtOrThrow(userId: string, courtId: string) {
  const court = await prisma.court.findUniqueOrThrow({
    where: { id: courtId },
    include: { venue: { include: { provider: true } } },
  });
  if (court.venue.provider.userId !== userId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Không phải chủ sở hữu sân này.', 403);
  }
  return court;
}

export interface CreateInternalBookingInput {
  courtId: string;
  startAt: Date;
  endAt: Date;
  guestName: string;
  guestContact: string;
}

/** VEN-09 — Ghi booking tại quầy (AC-VEN-09-1..3). BR-VEN-08/08a: không thu
 * tiền, không gắn tài khoản người chơi — chỉ khóa lịch. Không gọi finance,
 * không publish bất kỳ event nào liên quan doanh thu (AC-VEN-09-4 đúng THEO
 * THIẾT KẾ: không có đường nào trong hàm này chạm finance). */
export async function createInternalBooking(userId: string, input: CreateInternalBookingInput) {
  const court = await getOwnedCourtOrThrow(userId, input.courtId);
  if (!court.active) {
    throw new AppError('COURT_INACTIVE', 'Sân đã bị vô hiệu hóa.', 409);
  }
  if (!input.guestName.trim() || !input.guestContact.trim()) {
    throw new AppError('GUEST_INFO_REQUIRED', 'Cần tên và số liên hệ của khách.', 400);
  }

  const priceSnapshot = await calculateBookingPrice(court.id, input.startAt, input.endAt);
  return prisma.$transaction(async (tx) => {
    await lockCourtSchedule(tx, court.id);
    await assertCourtAcceptsCommitment(tx, court.id, input.endAt);
    if (!(await tx.court.findUniqueOrThrow({ where: { id: court.id } })).active) {
      throw new AppError('COURT_INACTIVE', 'Sân đã ngừng hoạt động.', 409);
    }
    if (await isRangeClosed(court.id, input.startAt, input.endAt, tx)) {
      throw new AppError('COURT_CLOSED', 'Sân đã khóa lịch trong khung giờ này.', 409);
    }
    const overlappingBooking = await tx.booking.findFirst({ where: {
      courtId: court.id, status: 'confirmed', startAt: { lt: input.endAt }, endAt: { gt: input.startAt },
    } });
    if (overlappingBooking) throw new AppError('SLOT_ALREADY_BOOKED', 'Khung giờ đã có lượt đặt sân xác nhận.', 409);
    const overlappingHold = await tx.hold.findFirst({ where: {
      courtId: court.id, expiresAt: { gt: new Date() }, startAt: { lt: input.endAt }, endAt: { gt: input.startAt },
    } });
    if (overlappingHold) throw new AppError('SLOT_ON_HOLD', 'Khung giờ đang được giữ chỗ bởi người chơi khác.', 409);
    return tx.booking.create({ data: {
      courtId: court.id, startAt: input.startAt, endAt: input.endAt, userId: null,
      guestName: input.guestName, guestContact: input.guestContact, source: 'internal', status: 'confirmed', priceSnapshot,
    } });
  });
}

/** VEN-09 luồng thay thế — Hủy booking nội bộ (AC-VEN-09-5). Không có luồng
 * hoàn tiền vì nền tảng chưa từng thu tiền cho booking nội bộ (BR-VEN-08). */
export async function cancelInternalBooking(userId: string, bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { court: { include: { venue: { include: { provider: true } } } } },
  });
  if (booking.court.venue.provider.userId !== userId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Không phải chủ sở hữu lượt đặt sân này.', 403);
  }
  if (booking.source !== 'internal') {
    throw new AppError('NOT_INTERNAL_BOOKING', 'Chỉ hủy được lượt đặt sân nội bộ qua thao tác này.', 400);
  }
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'cancelled', cancellationReason: 'provider_fault' },
  });
}
