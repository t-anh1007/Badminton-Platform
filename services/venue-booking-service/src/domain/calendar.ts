import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export interface CalendarEntry {
  courtId: string;
  kind: 'booking' | 'hold';
  source?: 'marketplace' | 'internal';
  startAt: Date;
  endAt: Date;
}

export interface CalendarResult {
  courts: { courtId: string; courtName: string; closedAllDay: boolean }[];
  entries: CalendarEntry[];
}

/** VEN-08 — Lịch sân hợp nhất cho một ngày (AC-VEN-08-1..5). Chỉ chủ sở hữu
 * cơ sở mới xem được (BR-VEN-11). */
export async function getUnifiedCalendar(userId: string, venueId: string, date: Date): Promise<CalendarResult> {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    include: { provider: true, courts: true },
  });
  if (venue.provider.userId !== userId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Không phải chủ sở hữu cơ sở này.', 403);
  }

  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const courtIds = venue.courts.map((c) => c.id);

  const [closures, bookings, holds] = await Promise.all([
    prisma.closure.findMany({ where: { courtId: { in: courtIds }, date: dayStart } }),
    prisma.booking.findMany({
      where: { courtId: { in: courtIds }, startAt: { lt: dayEnd }, endAt: { gt: dayStart }, status: { in: ['confirmed', 'held'] } },
    }),
    prisma.hold.findMany({
      where: { courtId: { in: courtIds }, startAt: { lt: dayEnd }, endAt: { gt: dayStart }, expiresAt: { gt: new Date() } },
    }),
  ]);

  const closedCourtIds = new Set(closures.map((c) => c.courtId));

  const entries: CalendarEntry[] = [
    ...bookings
      .filter((b) => b.status === 'confirmed')
      .map((b) => ({
        courtId: b.courtId,
        kind: 'booking' as const,
        source: b.source,
        startAt: b.startAt,
        endAt: b.endAt,
      })),
    ...holds.map((h) => ({ courtId: h.courtId, kind: 'hold' as const, startAt: h.startAt, endAt: h.endAt })),
  ];

  return {
    courts: venue.courts.map((c) => ({
      courtId: c.id,
      courtName: c.name,
      closedAllDay: closedCourtIds.has(c.id),
    })),
    entries,
  };
}
