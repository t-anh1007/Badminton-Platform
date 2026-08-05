import { prisma } from '../lib/prisma.js';

/** Kiểm tra một khoảng [startAt,endAt) trên một sân có TRỐNG hoàn toàn không —
 * không booking confirmed, không hold chưa hết hạn nào chồng lấn. Dùng chung
 * cho BOK-02 (lọc), BOK-04 (lịch trống), BOK-05 (xác nhận chọn slot), BOK-06
 * (giữ chỗ). */
export async function isRangeFree(courtId: string, startAt: Date, endAt: Date): Promise<boolean> {
  const now = new Date();
  const [booking, hold] = await Promise.all([
    prisma.booking.findFirst({
      where: { courtId, status: 'confirmed', startAt: { lt: endAt }, endAt: { gt: startAt } },
    }),
    prisma.hold.findFirst({
      where: { courtId, expiresAt: { gt: now }, startAt: { lt: endAt }, endAt: { gt: startAt } },
    }),
  ]);
  return !booking && !hold;
}

/** Trả về đoạn con đầu tiên trong [startAt,endAt) bị vướng (booking hoặc hold),
 * dùng để báo lỗi cụ thể (AC-BOK-05-4). */
export async function findConflictingRange(
  courtId: string,
  startAt: Date,
  endAt: Date,
): Promise<{ startAt: Date; endAt: Date } | null> {
  const now = new Date();
  const [booking, hold] = await Promise.all([
    prisma.booking.findFirst({
      where: { courtId, status: 'confirmed', startAt: { lt: endAt }, endAt: { gt: startAt } },
      orderBy: { startAt: 'asc' },
    }),
    prisma.hold.findFirst({
      where: { courtId, expiresAt: { gt: now }, startAt: { lt: endAt }, endAt: { gt: startAt } },
      orderBy: { startAt: 'asc' },
    }),
  ]);
  const candidates: { startAt: Date; endAt: Date }[] = [];
  if (booking) candidates.push({ startAt: booking.startAt, endAt: booking.endAt });
  if (hold) candidates.push({ startAt: hold.startAt, endAt: hold.endAt });
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0]!;
}

/** Sân có nằm trong ngày đóng cửa không (BR-VEN-05, AC-BOK-04-6). */
export async function isClosedOnDate(courtId: string, date: Date): Promise<boolean> {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const closure = await prisma.closure.findUnique({ where: { courtId_date: { courtId, date: dayStart } } });
  return closure !== null;
}
