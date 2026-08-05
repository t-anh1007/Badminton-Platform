import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export interface PricingWindowInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
  price: bigint | number;
}

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

/** VEN-06 — Lưu biểu giá cho một sân, hiệu lực từ `effectiveFrom` (AC-VEN-06-1..3).
 * Kiểm: không chồng lấn trong cùng thứ; phủ hết giờ hoạt động của thứ đó. */
export async function savePricingRules(
  userId: string,
  courtId: string,
  rules: PricingWindowInput[],
  effectiveFrom: Date,
) {
  const court = await getOwnedCourtOrThrow(userId, courtId);

  // Dung sai 60s cho "ngay bây giờ" — tránh việc gọi savePricingRules(new Date())
  // rồi vài ms sau Date.now() đã lớn hơn effectiveFrom, khiến "hiện tại" bị
  // hiểu nhầm thành "quá khứ".
  const PAST_TOLERANCE_MS = 60_000;
  if (effectiveFrom.getTime() < Date.now() - PAST_TOLERANCE_MS) {
    throw new AppError('EFFECTIVE_FROM_IN_PAST', 'Thời điểm hiệu lực không được ở quá khứ.', 400);
  }

  const byWeekday = new Map<number, PricingWindowInput[]>();
  for (const r of rules) {
    if (r.startMinute >= r.endMinute) {
      throw new AppError('INVALID_WINDOW', 'Khung giá không hợp lệ: giờ bắt đầu phải trước giờ kết thúc.', 400);
    }
    const list = byWeekday.get(r.weekday) ?? [];
    list.push(r);
    byWeekday.set(r.weekday, list);
  }

  for (const [weekday, windows] of byWeekday) {
    const sorted = [...windows].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      const prevItem = sorted[i - 1]!;
      const currItem = sorted[i]!;
      if (currItem.startMinute < prevItem.endMinute) {
        throw new AppError(
          'OVERLAPPING_WINDOWS',
          `Hai khung giá chồng lấn ở thứ ${weekday}: [${prevItem.startMinute}-${prevItem.endMinute}) và [${currItem.startMinute}-${currItem.endMinute}).`,
          409,
        );
      }
    }

    const oh = court.operatingHours.find((h) => h.weekday === weekday);
    if (oh) {
      let cursor = oh.openMinute;
      for (const w of sorted) {
        if (w.startMinute > cursor) {
          throw new AppError(
            'PRICING_GAP',
            `Giờ hoạt động thứ ${weekday} có đoạn [${cursor}-${w.startMinute}) chưa có biểu giá.`,
            409,
            { gapStart: cursor, gapEnd: w.startMinute },
          );
        }
        cursor = Math.max(cursor, w.endMinute);
      }
      if (cursor < oh.closeMinute) {
        throw new AppError(
          'PRICING_GAP',
          `Giờ hoạt động thứ ${weekday} có đoạn [${cursor}-${oh.closeMinute}) chưa có biểu giá.`,
          409,
          { gapStart: cursor, gapEnd: oh.closeMinute },
        );
      }
    }
  }

  const currentMax = await prisma.pricingRule.aggregate({
    where: { courtId },
    _max: { version: true },
  });
  const version = (currentMax._max.version ?? 0) + 1;

  await prisma.pricingRule.createMany({
    data: rules.map((r) => ({
      courtId,
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      price: BigInt(r.price),
      version,
      effectiveFrom,
    })),
  });

  return { version };
}

/** Biểu giá hiệu lực tại một thời điểm cho một thứ — phiên bản mới nhất có
 * `effectiveFrom <= atDate`. Dùng cho BOK-04 (hiển thị giá) và tính tiền booking. */
export async function getEffectivePricingWindows(courtId: string, weekday: number, atDate: Date) {
  const rules = await prisma.pricingRule.findMany({
    where: { courtId, weekday, effectiveFrom: { lte: atDate } },
    orderBy: [{ version: 'desc' }, { startMinute: 'asc' }],
  });
  if (rules.length === 0) return [];
  const latestVersion = rules[0]!.version;
  return rules.filter((r) => r.version === latestVersion).sort((a, b) => a.startMinute - b.startMinute);
}

/** BR-VEN-07 — tổng tiền booking bắc cầu nhiều khung giá (AC-VEN-06-5). */
export async function calculateBookingPrice(courtId: string, startAt: Date, endAt: Date): Promise<bigint> {
  const weekday = startAt.getUTCDay();
  const startMinute = startAt.getUTCHours() * 60 + startAt.getUTCMinutes();
  const endMinute = endAt.getUTCHours() * 60 + endAt.getUTCMinutes();
  const windows = await getEffectivePricingWindows(courtId, weekday, startAt);

  let total = 0n;
  for (const w of windows) {
    const overlapStart = Math.max(startMinute, w.startMinute);
    const overlapEnd = Math.min(endMinute, w.endMinute);
    if (overlapEnd > overlapStart) {
      const minutes = overlapEnd - overlapStart;
      total += (w.price * BigInt(minutes)) / 60n;
    }
  }
  return total;
}
