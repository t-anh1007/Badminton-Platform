import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { getEffectivePricingWindows } from './pricing.js';
import { isRangeFree, isClosedOnDate } from './slotAvailability.js';

export interface ScheduleSlot {
  startMinute: number;
  endMinute: number;
  available: boolean;
  price: bigint | null;
}

export interface ScheduleResult {
  closed: boolean;
  slots: ScheduleSlot[];
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** BOK-04 — Xem lịch trống và giá hiện hành cho một ngày (AC-BOK-04-1..6). */
export async function getAvailabilitySchedule(courtId: string, date: Date): Promise<ScheduleResult> {
  const today = startOfDayUTC(new Date());
  const requested = startOfDayUTC(date);
  if (requested.getTime() < today.getTime()) {
    // BR-BOK-11: không xem/đặt được cho khoảng thời gian đã trôi qua.
    throw new AppError('DATE_IN_PAST', 'Không thể xem lịch của ngày đã qua.', 400);
  }

  if (await isClosedOnDate(courtId, requested)) {
    return { closed: true, slots: [] };
  }

  const weekday = requested.getUTCDay();
  const operatingHour = await prisma.operatingHour.findUnique({ where: { courtId_weekday: { courtId, weekday } } });
  if (!operatingHour) {
    return { closed: true, slots: [] };
  }

  const rule = await prisma.bookingRule.findUnique({ where: { courtId } });
  const step = rule?.stepMinutes ?? 30; // A-VEN-05: mặc định 30 phút

  const slots: ScheduleSlot[] = [];
  for (let m = operatingHour.openMinute; m < operatingHour.closeMinute; m += step) {
    const slotStart = new Date(requested.getTime() + m * 60_000);
    const slotEnd = new Date(requested.getTime() + (m + step) * 60_000);
    const available = await isRangeFree(courtId, slotStart, slotEnd);

    const windows = await getEffectivePricingWindows(courtId, weekday, slotStart);
    const covering = windows.find((w) => w.startMinute <= m && w.endMinute >= m + step);

    slots.push({ startMinute: m, endMinute: m + step, available, price: covering?.price ?? null });
  }

  return { closed: false, slots };
}
