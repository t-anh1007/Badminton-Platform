import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';
import { getRefundPercentageFromSnapshot } from './cancellationPolicy.js';
import { lockCourtSchedule } from '../lib/courtScheduleLock.js';

function operationalWindow(startAt: Date, endAt: Date) {
  const sameDay = startAt.getUTCFullYear() === endAt.getUTCFullYear()
    && startAt.getUTCMonth() === endAt.getUTCMonth()
    && startAt.getUTCDate() === endAt.getUTCDate();
  const startMinute = startAt.getUTCHours() * 60 + startAt.getUTCMinutes();
  const rawEndMinute = endAt.getUTCHours() * 60 + endAt.getUTCMinutes();
  const endMinute = sameDay ? rawEndMinute : 1440;
  const dayStart = new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()));
  return { weekday: startAt.getUTCDay(), startMinute, endMinute, dayStart };
}

function assertCancellable(booking: { status: string; startAt: Date }): void {
  if (booking.status !== 'confirmed') {
    throw new AppError('BOOKING_NOT_CONFIRMED', 'Chỉ hủy hoặc điều chỉnh booking đã xác nhận.', 409);
  }
  if (booking.startAt.getTime() <= Date.now()) {
    throw new AppError('BOOKING_ALREADY_STARTED', 'Ca đã bắt đầu nên không thể hủy hoặc điều chỉnh.', 409);
  }
}

export async function cancelBookingByPlayer(userId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { court: { include: { venue: { include: { provider: true } } } } },
  });
  if (!booking || booking.source !== 'marketplace') {
    throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);
  }
  if (booking.userId !== userId) {
    throw new AppError('FORBIDDEN', 'Không có quyền hủy booking này.', 403);
  }
  if (booking.status === 'held') {
    return prisma.$transaction(async (tx) => {
      const removed = await tx.booking.deleteMany({
        where: { id: booking.id, status: 'held' },
      });
      if (removed.count !== 1) {
        throw new AppError('BOOKING_CHANGED_CONCURRENTLY', 'Booking vừa được xử lý trước đó.', 409);
      }
      if (booking.holdId) await tx.hold.deleteMany({ where: { id: booking.holdId } });
      return { status: 'cancelled' as const, refundPercent: 0 };
    });
  }
  // D39/D33 recovery: if the Venue cancellation committed but Matchmaking
  // crashed before it consumed the result, the same authenticated owner gets
  // the durable policy outcome rather than a misleading conflict.
  if (booking.status === 'cancelled' && booking.cancellationReason === 'self'
    && booking.cancellationRefundPercent !== null) {
    return { status: 'cancelled' as const, refundPercent: booking.cancellationRefundPercent };
  }
  assertCancellable(booking);
  const hoursUntilStart = (booking.startAt.getTime() - Date.now()) / 3_600_000;
  const refundPercent = getRefundPercentageFromSnapshot(booking.policySnapshot, hoursUntilStart);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: booking.id, status: 'confirmed' },
      data: { status: 'cancelled', cancellationReason: 'self', cancellationRefundPercent: refundPercent },
    });
    if (updated.count !== 1) {
      throw new AppError('BOOKING_NOT_CONFIRMED', 'Booking đã được xử lý trước đó.', 409);
    }
    await writeOutbox(tx, {
      aggregateType: 'Booking',
      aggregateId: booking.id,
      eventType: 'BookingCancelled',
      payload: {
        bookingId: booking.id,
        userId: booking.userId,
        businessUserId: booking.court.venue.provider.userId,
        gross: booking.priceSnapshot.toString(),
        refundPercent,
        reason: 'self',
      },
    });
    return { status: 'cancelled' as const, refundPercent };
  });
}

async function getProviderBooking(providerUserId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { court: { include: { venue: { include: { provider: true } } } } },
  });
  if (!booking || booking.source !== 'marketplace') {
    throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);
  }
  if (booking.court.venue.provider.userId !== providerUserId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Không phải chủ sở hữu cơ sở của booking này.', 403);
  }
  assertCancellable(booking);
  return booking;
}

export async function listReplacementCourts(providerUserId: string, bookingId: string) {
  const booking = await getProviderBooking(providerUserId, bookingId);
  const window = operationalWindow(booking.startAt, booking.endAt);
  const courts = await prisma.court.findMany({
    where: {
      venueId: booking.court.venueId,
      id: { not: booking.courtId },
      active: true,
      operatingHours: { some: { weekday: window.weekday, openMinute: { lte: window.startMinute }, closeMinute: { gte: window.endMinute } } },
      closures: { none: { date: window.dayStart } },
      bookings: {
        none: {
          status: 'confirmed',
          startAt: { lt: booking.endAt },
          endAt: { gt: booking.startAt },
        },
      },
      holds: {
        none: {
          expiresAt: { gt: new Date() },
          startAt: { lt: booking.endAt },
          endAt: { gt: booking.startAt },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  return courts;
}

export async function changeBookingCourt(providerUserId: string, bookingId: string, replacementCourtId: string) {
  const booking = await getProviderBooking(providerUserId, bookingId);
  return prisma.$transaction(async (tx) => {
    await lockCourtSchedule(tx, replacementCourtId);
    const window = operationalWindow(booking.startAt, booking.endAt);
    const replacement = await tx.court.findFirst({
      where: {
        id: replacementCourtId,
        venueId: booking.court.venueId,
        active: true,
        operatingHours: { some: { weekday: window.weekday, openMinute: { lte: window.startMinute }, closeMinute: { gte: window.endMinute } } },
        closures: { none: { date: window.dayStart } },
        bookings: { none: { status: 'confirmed', startAt: { lt: booking.endAt }, endAt: { gt: booking.startAt } } },
        holds: { none: { expiresAt: { gt: new Date() }, startAt: { lt: booking.endAt }, endAt: { gt: booking.startAt } } },
      },
    });
    if (!replacement) {
      throw new AppError('REPLACEMENT_COURT_UNAVAILABLE', 'Sân thay thế không khả dụng trong khung giờ này.', 409);
    }
    const changedAt = new Date();
    const updated = await tx.booking.updateMany({
      where: { id: booking.id, status: 'confirmed', courtId: booking.courtId },
      data: { courtId: replacementCourtId, courtChangedAt: changedAt },
    });
    if (updated.count !== 1) {
      throw new AppError('BOOKING_CHANGED_CONCURRENTLY', 'Booking vừa được thay đổi bởi thao tác khác.', 409);
    }
    await writeOutbox(tx, {
      aggregateType: 'Booking',
      aggregateId: booking.id,
      eventType: 'BookingCourtChanged',
      payload: { bookingId: booking.id, courtId: replacementCourtId, changedAt: changedAt.toISOString() },
    });
    return tx.booking.findUniqueOrThrow({ where: { id: booking.id } });
  });
}

export async function cancelBookingByAdmin(bookingId: string, cancellationNote: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { court: { include: { venue: { include: { provider: true } } } } },
  });
  if (!booking || booking.source !== 'marketplace') throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);
  assertCancellable(booking);
  return cancelBookingWithReason(booking, 'platform_admin', cancellationNote);
}

async function cancelBookingWithReason(
  booking: Awaited<ReturnType<typeof getProviderBooking>>,
  reason: 'provider_fault' | 'platform_admin',
  cancellationNote: string,
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: booking.id, status: 'confirmed' },
      data: { status: 'cancelled', cancellationReason: reason, cancellationRefundPercent: 100 },
    });
    if (updated.count !== 1) throw new AppError('BOOKING_NOT_CONFIRMED', 'Booking đã được xử lý trước đó.', 409);
    await writeOutbox(tx, {
      aggregateType: 'Booking', aggregateId: booking.id, eventType: 'BookingCancelled',
      payload: {
        bookingId: booking.id, userId: booking.userId,
        businessUserId: booking.court.venue.provider.userId,
        gross: booking.priceSnapshot.toString(), refundPercent: 100, reason, cancellationNote,
      },
    });
    return { status: 'cancelled' as const, refundPercent: 100 };
  });
}

export async function cancelBookingByProvider(providerUserId: string, bookingId: string, cancellationNote: string) {
  const booking = await getProviderBooking(providerUserId, bookingId);
  return cancelBookingWithReason(booking, 'provider_fault', cancellationNote);
}
