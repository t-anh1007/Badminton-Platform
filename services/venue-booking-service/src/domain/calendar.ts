import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { HttpAccountDisplayNameClient, type AccountDisplayNameClient } from '../clients/account.js';

export interface CalendarEntry {
  /** Chỉ có ở booking (để quản lý/xem chi tiết); hold không mang id. */
  id?: string;
  courtId: string;
  kind: 'booking' | 'hold';
  source?: 'marketplace' | 'internal';
  startAt: Date;
  endAt: Date;
  /** Nhãn khách: người chơi đã đăng nhập hoặc tên khách vãng lai (booking). */
  customerLabel?: string;
  /** Liên hệ khách — chỉ với booking nội bộ (nguồn internal). */
  guestContact?: string | null;
  /** Giá đã chốt (BigInt tuần tự hóa thành chuỗi để trả JSON). */
  priceSnapshot?: string;
}

export interface CalendarResult {
  courts: { courtId: string; courtName: string; closedAllDay: boolean }[];
  entries: CalendarEntry[];
}

/** VEN-08 — Lịch sân hợp nhất cho một ngày (AC-VEN-08-1..5). Chỉ chủ sở hữu
 * cơ sở mới xem được (BR-VEN-11). */
export async function getUnifiedCalendar(
  userId: string,
  venueId: string,
  date: Date,
  accountClient: AccountDisplayNameClient = new HttpAccountDisplayNameClient(),
): Promise<CalendarResult> {
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
  const marketplaceUserIds = bookings.flatMap((booking) => booking.userId ? [booking.userId] : []);
  let displayNames = new Map<string, string>();
  try {
    const profiles = await accountClient.getPublicDisplayNames(marketplaceUserIds);
    displayNames = new Map(profiles.flatMap((profile) => profile.displayName ? [[profile.userId, profile.displayName]] : []));
  } catch {
    // Tên là dữ liệu enrich; lịch vẫn dùng được nếu account-service tạm thời không phản hồi.
  }

  const entries: CalendarEntry[] = [
    ...bookings
      .filter((b) => b.status === 'confirmed')
      .map((b) => ({
        id: b.id,
        courtId: b.courtId,
        kind: 'booking' as const,
        source: b.source,
        startAt: b.startAt,
        endAt: b.endAt,
        customerLabel: b.userId ? (displayNames.get(b.userId) ?? 'Người chơi') : (b.guestName ?? 'Khách vãng lai'),
        guestContact: b.source === 'internal' ? b.guestContact : null,
        priceSnapshot: b.priceSnapshot.toString(),
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
