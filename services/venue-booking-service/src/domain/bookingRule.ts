import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

async function getOwnedCourtOrThrow(userId: string, courtId: string) {
  const court = await prisma.court.findUniqueOrThrow({
    where: { id: courtId },
    include: { venue: { include: { provider: true } }, operatingHours: true },
  });
  if (court.venue.provider.userId !== userId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Không phải chủ sở hữu sân này.', 403);
  }
  return court;
}

/** VEN-07 — Lưu quy tắc đặt sân (AC-VEN-07-1..3). */
export async function setBookingRule(
  userId: string,
  courtId: string,
  stepMinutes: number,
  minDurationMinutes: number,
  maxDurationMinutes: number,
) {
  const court = await getOwnedCourtOrThrow(userId, courtId);

  if (minDurationMinutes > maxDurationMinutes) {
    throw new AppError('MIN_GREATER_THAN_MAX', 'Thời lượng tối thiểu phải nhỏ hơn hoặc bằng tối đa.', 400);
  }
  if (minDurationMinutes % stepMinutes !== 0) {
    throw new AppError('MIN_NOT_MULTIPLE_OF_STEP', 'Thời lượng tối thiểu phải là bội số của bước thời gian.', 400);
  }

  if (court.operatingHours.length > 0) {
    const maxSpan = Math.max(...court.operatingHours.map((h) => h.closeMinute - h.openMinute));
    if (maxDurationMinutes > maxSpan) {
      throw new AppError(
        'MAX_EXCEEDS_OPERATING_HOURS',
        'Thời lượng tối đa vượt quá độ dài giờ hoạt động trong ngày.',
        400,
      );
    }
  }

  return prisma.bookingRule.upsert({
    where: { courtId },
    create: { courtId, stepMinutes, minDurationMinutes, maxDurationMinutes },
    update: { stepMinutes, minDurationMinutes, maxDurationMinutes },
  });
}

/** Kiểm tra một thời lượng có hợp lệ theo quy tắc đã lưu không — BOK-05/06 (G3)
 * sẽ gọi lại hàm này khi người chơi chọn slot / tạo hold (AC-VEN-07-4). */
export async function isDurationAllowed(courtId: string, durationMinutes: number): Promise<boolean> {
  const rule = await prisma.bookingRule.findUnique({ where: { courtId } });
  if (!rule) return true; // chưa cấu hình quy tắc riêng — không chặn
  if (durationMinutes < rule.minDurationMinutes || durationMinutes > rule.maxDurationMinutes) return false;
  return durationMinutes % rule.stepMinutes === 0;
}
