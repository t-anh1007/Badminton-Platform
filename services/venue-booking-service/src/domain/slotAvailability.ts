import { prisma } from '../lib/prisma.js';
import { canOfferCourtSlot } from './operationalShutdown.js';
import { vietnamDateIdentifier, vietnamMinuteOfDay } from '../lib/vietnamTime.js';

/** Kiểm tra một khoảng [startAt,endAt) trên một sân có TRỐNG hoàn toàn không —
 * không booking confirmed, không hold chưa hết hạn nào chồng lấn. Dùng chung
 * cho BOK-02 (lọc), BOK-04 (lịch trống), BOK-05 (xác nhận chọn slot), BOK-06
 * (giữ chỗ). */
export async function isRangeFree(courtId: string, startAt: Date, endAt: Date): Promise<boolean> {
  if (!(await canOfferCourtSlot(courtId, endAt))) return false;
  if (await isRangeClosed(courtId, startAt, endAt)) return false;
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

type Db = Pick<typeof prisma, 'closure'>;

/** VEN-05c — khung khóa đầu tiên giao với [startMinute, endMinute) của ngày `day`
 * (định danh 00:00 UTC). Khóa cả ngày (startMinute null) giao với mọi khoảng. */
export function findClosureOverlapping(db: Db, courtId: string, day: Date, startMinute: number, endMinute: number) {
  return db.closure.findFirst({
    where: {
      courtId,
      date: day,
      OR: [{ startMinute: null }, { startMinute: { lt: endMinute }, endMinute: { gt: startMinute } }],
    },
  });
}

/** Khoảng [startAt,endAt) có chạm khung khóa nào không (booking không vắt qua nửa đêm). */
export async function isRangeClosed(courtId: string, startAt: Date, endAt: Date, db: Db = prisma): Promise<boolean> {
  const day = vietnamDateIdentifier(startAt);
  const sameDay = vietnamDateIdentifier(endAt).getTime() === day.getTime();
  const endMinute = sameDay ? vietnamMinuteOfDay(endAt) : 24 * 60;
  return (await findClosureOverlapping(db, courtId, day, vietnamMinuteOfDay(startAt), endMinute)) !== null;
}

/** Sân có bị khóa CẢ NGÀY không (BR-VEN-05, AC-BOK-04-6). Khóa theo khung giờ
 * được isRangeFree xử lý theo từng slot. */
export async function isClosedOnDate(courtId: string, date: Date): Promise<boolean> {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const closure = await prisma.closure.findFirst({ where: { courtId, date: dayStart, startMinute: null } });
  return closure !== null;
}
