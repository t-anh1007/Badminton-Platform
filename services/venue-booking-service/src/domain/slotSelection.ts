import { AppError } from '../lib/errors.js';
import { isDurationAllowed } from './bookingRule.js';
import { calculateBookingPrice } from './pricing.js';
import { findConflictingRange } from './slotAvailability.js';

export interface SlotSelectionResult {
  courtId: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  totalPrice: bigint;
}

/** BOK-05 — Chọn slot và thời lượng (AC-BOK-05-1..4). Cần đăng nhập ở tầng
 * route (requireAuth) — AC-BOK-05-5 kiểm ở đó. */
export async function selectSlot(
  courtId: string,
  startAt: Date,
  durationMinutes: number,
): Promise<SlotSelectionResult> {
  if (startAt.getTime() < Date.now()) {
    throw new AppError('SLOT_IN_PAST', 'Không thể chọn khung giờ đã qua.', 400); // BR-BOK-11
  }

  // BR-VEN-10 (qua VEN-07's isDurationAllowed) — chặn cả ở app lẫn ở đây.
  if (!(await isDurationAllowed(courtId, durationMinutes))) {
    throw new AppError('INVALID_DURATION', 'Thời lượng không hợp lệ theo quy tắc đặt sân.', 400);
  }

  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

  const conflict = await findConflictingRange(courtId, startAt, endAt);
  if (conflict) {
    throw new AppError('SLOT_CONFLICT', 'Khoảng chọn đã có phần bị vướng.', 409, {
      conflictStartAt: conflict.startAt,
      conflictEndAt: conflict.endAt,
    });
  }

  const totalPrice = await calculateBookingPrice(courtId, startAt, endAt);

  return { courtId, startAt, endAt, durationMinutes, totalPrice };
}
