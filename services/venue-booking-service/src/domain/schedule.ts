import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

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

function minuteOfDayUTC(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
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
    if (b.startAt.getUTCDay() !== weekday) return false;
    const start = minuteOfDayUTC(b.startAt);
    const end = minuteOfDayUTC(b.endAt) || 24 * 60;
    return start < openMinute || end > closeMinute;
  });
  if (conflictingBookings.length > 0) {
    throw new AppError(
      'BLOCKED_BY_FUTURE_BOOKINGS',
      `Giờ hoạt động mới không phủ ${conflictingBookings.length} booking đã xác nhận. Hủy qua BOK-10 trước.`,
      409,
      { bookings: conflictingBookings },
    );
  }

  const activeHolds = await prisma.hold.findMany({
    where: { courtId, expiresAt: { gt: now } },
    select: { id: true, startAt: true, endAt: true, expiresAt: true },
  });
  const conflictingHold = activeHolds.find((h) => {
    if (h.startAt.getUTCDay() !== weekday) return false;
    const start = minuteOfDayUTC(h.startAt);
    const end = minuteOfDayUTC(h.endAt) || 24 * 60;
    return start < openMinute || end > closeMinute;
  });
  if (conflictingHold) {
    throw new AppError(
      'BLOCKED_BY_ACTIVE_HOLD',
      `Còn một lượt giữ chỗ chưa hết hạn ở khung này, thử lại sau ${conflictingHold.expiresAt.toISOString()}.`,
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

/** VEN-05 — Thêm ngày đóng cửa ngoại lệ (AC-VEN-05-2,3). */
export async function addClosure(userId: string, courtId: string, date: Date, reason?: string) {
  await getOwnedCourtOrThrow(userId, courtId);
  const weekday = date.getUTCDay();
  // Đóng cửa cả ngày == thu hẹp giờ hoạt động về [0,0) cho đúng ngày đó.
  await assertNoConflictForNarrowedWindow(courtId, weekday, 0, 0);

  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return prisma.closure.upsert({
    where: { courtId_date: { courtId, date: dayStart } },
    create: { courtId, date: dayStart, reason },
    update: { reason },
  });
}
