import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { vietnamDateIdentifier, vietnamMinuteOfDay, vietnamMinuteToInstant, vietnamWeekday } from '../lib/vietnamTime.js';
import { lockCourtSchedule } from '../lib/courtScheduleLock.js';
import { findClosureOverlapping } from './slotAvailability.js';

/** Giờ Việt Nam dạng HH:mm cho thông báo. */
function vietnamClock(value: Date): string {
  const m = vietnamMinuteOfDay(value);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

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

/** BR-VEN-05/05a dùng chung: chặn nếu có booking `confirmed` tương lai HOẶC
 * `HOLD` chưa hết hạn rơi vào đúng `weekday`, ở khung giờ [openMinute,
 * closeMinute) MỚI KHÔNG PHỦ TỚI (tức phần bị thu hẹp/loại bỏ). Mở rộng giờ
 * không bao giờ tạo xung đột vì khung mới luôn chứa khung cũ — không cần
 * nhánh riêng cho AC-VEN-05-5. */
async function assertNoConflictForNarrowedWindow(
  courtId: string,
  weekday: number,
  openMinute: number,
  closeMinute: number,
) {
  const now = new Date();

  const futureConfirmed = await prisma.booking.findMany({
    where: { courtId, status: 'confirmed', startAt: { gt: now } },
    select: { id: true, startAt: true, endAt: true },
  });
  const conflictingBookings = futureConfirmed.filter((b) => {
    if (vietnamWeekday(b.startAt) !== weekday) return false;
    const start = vietnamMinuteOfDay(b.startAt);
    const end = vietnamMinuteOfDay(b.endAt) || 24 * 60;
    return start < openMinute || end > closeMinute;
  });
  if (conflictingBookings.length > 0) {
    throw new AppError(
      'BLOCKED_BY_FUTURE_BOOKINGS',
      `Giờ hoạt động mới không phủ ${conflictingBookings.length} lượt đặt sân đã xác nhận. Hủy qua BOK-10 trước.`,
      409,
      { bookings: conflictingBookings },
    );
  }

  const activeHolds = await prisma.hold.findMany({
    where: { courtId, expiresAt: { gt: now } },
    select: { id: true, startAt: true, endAt: true, expiresAt: true },
  });
  const conflictingHold = activeHolds.find((h) => {
    if (vietnamWeekday(h.startAt) !== weekday) return false;
    const start = vietnamMinuteOfDay(h.startAt);
    const end = vietnamMinuteOfDay(h.endAt) || 24 * 60;
    return start < openMinute || end > closeMinute;
  });
  if (conflictingHold) {
    throw new AppError(
      'BLOCKED_BY_ACTIVE_HOLD',
      `Còn một lượt giữ chỗ chưa hết hạn ở khung này, thử lại sau ${vietnamClock(conflictingHold.expiresAt)}.`,
      409,
      { holdExpiresAt: conflictingHold.expiresAt },
    );
  }
}

/** VEN-05 — Lưu giờ hoạt động cho một thứ trong tuần (AC-VEN-05-1,4,5,6). */
export async function setOperatingHours(
  userId: string,
  courtId: string,
  weekday: number,
  openMinute: number,
  closeMinute: number,
) {
  await getOwnedCourtOrThrow(userId, courtId);
  if (openMinute >= closeMinute) {
    throw new AppError('INVALID_HOURS', 'Giờ đóng phải sau giờ mở.', 400);
  }

  await assertNoConflictForNarrowedWindow(courtId, weekday, openMinute, closeMinute);

  return prisma.operatingHour.upsert({
    where: { courtId_weekday: { courtId, weekday } },
    create: { courtId, weekday, openMinute, closeMinute },
    update: { openMinute, closeMinute },
  });
}

export async function replaceOperatingHours(
  userId: string,
  courtId: string,
  hours: Array<{ weekday: number; openMinute: number; closeMinute: number }>,
) {
  await getOwnedCourtOrThrow(userId, courtId);
  const weekdays = new Set<number>();
  for (const item of hours) {
    if (weekdays.has(item.weekday)) throw new AppError('DUPLICATE_WEEKDAY', 'Mỗi ngày chỉ được có một khung giờ hoạt động.', 400);
    weekdays.add(item.weekday);
    if (item.openMinute >= item.closeMinute) throw new AppError('INVALID_HOURS', 'Giờ đóng phải sau giờ mở.', 400);
    await assertNoConflictForNarrowedWindow(courtId, item.weekday, item.openMinute, item.closeMinute);
  }
  const existing = await prisma.operatingHour.findMany({ where: { courtId } });
  for (const item of existing.filter((current) => !weekdays.has(current.weekday))) {
    await assertNoConflictForNarrowedWindow(courtId, item.weekday, 0, 0);
  }
  return prisma.$transaction([
    prisma.operatingHour.deleteMany({ where: { courtId } }),
    prisma.operatingHour.createMany({ data: hours.map((item) => ({ courtId, ...item })) }),
  ]);
}

/** VEN-05/05c — Khóa sân cả ngày hoặc một khung [startMinute, endMinute) theo giờ
 * Việt Nam. Chỉ kiểm xung đột (booking confirmed + HOLD còn hạn) trong đúng khoảng
 * bị khóa của đúng ngày đó (BR-VEN-05). */
export async function addClosure(
  userId: string,
  courtId: string,
  date: Date,
  reason?: string,
  range?: { startMinute: number; endMinute: number },
) {
  await getOwnedCourtOrThrow(userId, courtId);
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (day.getTime() < vietnamDateIdentifier(new Date()).getTime()) {
    throw new AppError('CLOSURE_IN_PAST', 'Không thể khóa lịch cho ngày đã qua.', 400);
  }
  const startMinute = range?.startMinute ?? 0;
  const endMinute = range?.endMinute ?? 24 * 60;
  if (range) {
    const step = (await prisma.bookingRule.findUnique({ where: { courtId } }))?.stepMinutes ?? 30;
    if (startMinute < 0 || endMinute > 24 * 60 || startMinute >= endMinute || startMinute % step || endMinute % step) {
      throw new AppError('INVALID_CLOSURE_RANGE', `Khung khóa phải có giờ kết thúc sau giờ bắt đầu và theo bước ${step} phút.`, 400);
    }
  }
  const rangeStart = vietnamMinuteToInstant(day, startMinute);
  const rangeEnd = vietnamMinuteToInstant(day, endMinute);

  return prisma.$transaction(async (tx) => {
    await lockCourtSchedule(tx, courtId);
    if (await findClosureOverlapping(tx, courtId, day, startMinute, endMinute)) {
      throw new AppError('CLOSURE_OVERLAP', 'Khoảng này đã nằm trong một khung khóa khác.', 409);
    }
    const bookings = await tx.booking.findMany({
      where: { courtId, status: 'confirmed', startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      select: { id: true, startAt: true, endAt: true },
    });
    if (bookings.length > 0) {
      throw new AppError(
        'BLOCKED_BY_FUTURE_BOOKINGS',
        `Khoảng khóa trùng ${bookings.length} lượt đặt sân đã xác nhận. Hủy các lượt này trước.`,
        409,
        { bookings },
      );
    }
    const hold = await tx.hold.findFirst({
      where: { courtId, expiresAt: { gt: new Date() }, startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      orderBy: { expiresAt: 'desc' },
    });
    if (hold) {
      throw new AppError(
        'BLOCKED_BY_ACTIVE_HOLD',
        `Còn một lượt giữ chỗ chưa hết hạn ở khung này, thử lại sau ${vietnamClock(hold.expiresAt)}.`,
        409,
        { holdExpiresAt: hold.expiresAt },
      );
    }
    return tx.closure.create({
      data: { courtId, date: day, reason, startMinute: range ? startMinute : null, endMinute: range ? endMinute : null },
    });
  });
}

/** VEN-05c — Mở lại: xóa bản ghi khóa (không liên quan tiền). */
export async function removeClosure(userId: string, courtId: string, closureId: string) {
  await getOwnedCourtOrThrow(userId, courtId);
  const { count } = await prisma.closure.deleteMany({ where: { id: closureId, courtId } });
  if (count === 0) throw new AppError('CLOSURE_NOT_FOUND', 'Không tìm thấy khung khóa.', 404);
}
