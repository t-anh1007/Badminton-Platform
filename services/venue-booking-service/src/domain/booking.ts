import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { calculateBookingPrice } from './pricing.js';
import { CANCELLATION_POLICY, getRefundPercentageFromSnapshot } from './cancellationPolicy.js';
import { venueMatchContextSchema } from '@khoaluantn/shared';
import type { MatchBookingResolutionPayload, MatchCancelledPayload } from '@khoaluantn/shared';
import { writeOutbox } from '../lib/outbox.js';

/** BOK-07 bước 1 — Tạo `BOOKING(status=held)` gắn với một hold hợp lệ, chốt
 * `priceSnapshot` + `policySnapshot` (BR-BOK-06), rồi xóa hold. Phương thức
 * thanh toán KHÔNG phải business logic của service này — FE gọi tiếp
 * finance-service (FIN-03/04) bằng `bookingId` trả về. */
export async function createBookingFromHold(userId: string, holdId: string) {
  return prisma.$transaction(async (tx) => {
    // Serialize retries/concurrent requests for the same physical hold. The unique
    // holdId is the final database guard; the lock lets every successful retry
    // return the original booking rather than surface a unique violation.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${holdId}, 0))`;
    const existing = await tx.booking.findUnique({ where: { holdId } });
    if (existing) {
      if (existing.userId !== userId) {
        throw new AppError('HOLD_NOT_FOUND', 'Không tìm thấy lượt giữ chỗ của bạn.', 404);
      }
      return existing;
    }

    const hold = await tx.hold.findUnique({ where: { id: holdId } });
    if (!hold || hold.userId !== userId) {
      throw new AppError('HOLD_NOT_FOUND', 'Không tìm thấy lượt giữ chỗ của bạn.', 404);
    }
    if (hold.expiresAt.getTime() <= Date.now()) {
      throw new AppError('HOLD_EXPIRED', 'Lượt giữ chỗ đã hết hạn.', 409);
    }

    const priceSnapshot = await calculateBookingPrice(hold.courtId, hold.startAt, hold.endAt);

    // KHÔNG xóa hold ở đây (sửa lỗi P1 Codex): spec BOK-07 xóa hold ở BƯỚC XÁC
    // NHẬN (bước 5), không phải lúc tạo booking. Xóa sớm mở lại slot ngay lập tức
    // -> người thứ hai tạo được hold trùng và trả tiền trong khi người thứ nhất
    // vẫn đang trả -> hai người cùng thanh toán một slot. Giữ hold thì EXCLUDE
    // constraint trên `holds` chặn người thứ hai suốt cửa sổ 10 phút. Hold được
    // xóa khi PaymentCompleted -> confirmed (eventConsumer.handlePaymentCompleted),
    // hoặc bị reap khi hết hạn (reapExpiredHolds).
    return tx.booking.create({
      data: {
        holdId,
        courtId: hold.courtId,
        startAt: hold.startAt,
        endAt: hold.endAt,
        userId,
        source: 'marketplace',
        status: 'held',
        priceSnapshot,
        policySnapshot: CANCELLATION_POLICY,
        holdExpiresAt: hold.expiresAt,
      },
    });
  });
}

/** true nếu booking đang `held` VÀ chưa qua mốc hết hạn của hold gốc — điều
 * kiện duy nhất để `PaymentCompleted` được phép xác nhận (BR-BOK-04). */
function isStillPayable(booking: { status: string; holdExpiresAt: Date | null }): boolean {
  return booking.status === 'held' && !!booking.holdExpiresAt && booking.holdExpiresAt.getTime() > Date.now();
}

/** API nội bộ cho finance-service hỏi trước khi ghi bút toán (FIN-03 cần
 * quyết định NGAY trong luồng đồng bộ; FIN-04/06 dùng theo flows.md §5:
 * "Hỏi venue-booking-service booking còn hold không?"). Tự chuyển
 * `held` quá hạn -> `cancelled` NGAY tại đây (self-healing, cùng kiểu với
 * reap hold ở G3) để câu trả lời luôn phản ánh trạng thái mới nhất. */
export async function getPaymentStatus(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);

  if (booking.status === 'held' && !isStillPayable(booking)) {
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } });
    booking.status = 'cancelled';
  }

  return {
    bookingId: booking.id,
    userId: booking.userId,
    status: booking.status,
    gross: booking.priceSnapshot.toString(),
    stillPayable: isStillPayable(booking),
  };
}

/** Snapshot nội bộ tối thiểu để matchmaking kiểm tra và hiển thị slot qua API,
 * không đọc trực tiếp schema venue_booking (D17/ADR 0004). */
export async function getMatchContext(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { court: { include: { venue: true } } },
  });
  if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);

  if (booking.status === 'held' && !isStillPayable(booking)) {
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } });
    booking.status = 'cancelled';
  }

  return venueMatchContextSchema.parse({
    bookingId: booking.id,
    ownerUserId: booking.userId,
    status: booking.status,
    priceSnapshot: booking.priceSnapshot.toString(),
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
    court: { id: booking.court.id, name: booking.court.name },
    venue: {
      id: booking.court.venue.id,
      name: booking.court.venue.name,
      address: booking.court.venue.address,
      lat: booking.court.venue.lat,
      lng: booking.court.venue.lng,
    },
  });
}

/** AC-BOK-07-5 — tác vụ nền quét booking `held` quá hạn hold -> `cancelled`,
 * slot trở lại khả dụng (không còn hold VÀ không còn booking held chặn chỗ). */
export async function reapExpiredHeldBookings(): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: { status: 'held', holdExpiresAt: { lte: new Date() } },
    data: { status: 'cancelled' },
  });
  return result.count;
}

export async function completeEndedBookings(now = new Date()): Promise<number> {
  const candidates = await prisma.booking.findMany({
    where: { status: 'confirmed', endAt: { lte: now } },
    select: { id: true },
  });
  let completed = 0;
  for (const candidate of candidates) {
    completed += await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.id}, 0))`;
      const updated = await tx.booking.updateMany({
        where: { id: candidate.id, status: 'confirmed', endAt: { lte: now } },
        data: { status: 'completed' },
      });
      if (updated.count === 0) return 0;
      await writeOutbox(tx, {
        aggregateType: 'Booking', aggregateId: candidate.id, eventType: 'BookingCompleted',
        payload: { bookingId: candidate.id, completedAt: now.toISOString() },
      });
      return 1;
    });
  }
  return completed;
}

export interface MatchBookingResolutionCommand {
  commandId: string;
  matchId: string;
  bookingId: string;
  attemptId: string | null;
  action: 'settle' | 'withdraw' | 'cancel';
  venueRevision: number;
}

/**
 * D39's venue-owned, atomic fence. A caller must persist its local action
 * first, then sends this idempotent command. The receipt and outbox event are
 * written in the same transaction as the booking state transition, so a late
 * match-settlement PaymentCompleted can never resurrect a revoked hold.
 */
export async function resolveMatchBooking(command: MatchBookingResolutionCommand): Promise<MatchBookingResolutionPayload> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.matchBookingCommand.findUnique({ where: { commandId: command.commandId } });
    if (existing) {
      return {
        commandId: existing.commandId,
        matchId: existing.matchId,
        bookingId: existing.bookingId,
        attemptId: existing.attemptId,
        action: existing.action,
        decision: existing.decision,
        winningAttemptId: existing.winningAttemptId,
        venueRevision: existing.venueRevision,
      } as MatchBookingResolutionPayload;
    }

    // Lock by booking, not command. Different commands racing over the same
    // physical slot must serialize into one winning transition.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${command.bookingId}, 0))`;
    const replay = await tx.matchBookingCommand.findUnique({ where: { commandId: command.commandId } });
    if (replay) {
      return {
        commandId: replay.commandId,
        matchId: replay.matchId,
        bookingId: replay.bookingId,
        attemptId: replay.attemptId,
        action: replay.action,
        decision: replay.decision,
        winningAttemptId: replay.winningAttemptId,
        venueRevision: replay.venueRevision,
      } as MatchBookingResolutionPayload;
    }
    const booking = await tx.booking.findUnique({
      where: { id: command.bookingId },
      include: { court: { include: { venue: { include: { provider: true } } } } },
    });
    if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y booking.', 404);

    let decision: MatchBookingResolutionPayload['decision'];
    let venueRevision = booking.matchSettlementRevision;
    let winningAttemptId = booking.matchSettlementAttemptId;
    const exactRevision = booking.matchSettlementRevision === command.venueRevision;
    const heldAndPayable = booking.status === 'held' && isStillPayable(booking);

    if (command.action === 'settle') {
      if (heldAndPayable && exactRevision) {
        venueRevision += 1;
        winningAttemptId = command.attemptId;
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: 'confirmed',
            matchSettlementRevision: venueRevision,
            matchSettlementAttemptId: command.attemptId,
          },
        });
        if (booking.userId) {
          await tx.hold.deleteMany({
            where: { courtId: booking.courtId, userId: booking.userId, startAt: booking.startAt, endAt: booking.endAt },
          });
        }
        decision = 'confirmed';
        await writeOutbox(tx, {
          aggregateType: 'Booking', aggregateId: booking.id, eventType: 'BookingConfirmed',
          payload: {
            bookingId: booking.id,
            businessUserId: booking.court.venue.provider.userId,
            gross: booking.priceSnapshot.toString(),
            venueId: booking.court.venue.id,
            endAt: booking.endAt.toISOString(),
            source: booking.source,
          },
        });
      } else if (booking.status === 'confirmed' || booking.status === 'completed') {
        decision = 'confirmed';
      } else if (booking.status === 'cancelled' || !heldAndPayable) {
        decision = 'cancelled';
      } else {
        // A revoke incremented the venue revision while the booking remains
        // held. This older attempt is terminally stale, not a new confirmation.
        decision = 'held_revoked';
      }
    } else if (command.action === 'withdraw') {
      if (booking.status === 'held' && exactRevision && heldAndPayable) {
        venueRevision += 1;
        await tx.booking.update({
          where: { id: booking.id },
          data: { matchSettlementRevision: venueRevision, matchSettlementAttemptId: null },
        });
        winningAttemptId = null;
        decision = 'held_revoked';
      } else if (booking.status === 'confirmed' || booking.status === 'completed') {
        decision = 'confirmed';
      } else if (booking.status === 'cancelled' || !heldAndPayable) {
        decision = 'cancelled';
      } else {
        decision = 'held_revoked';
      }
    } else if (booking.status === 'held' && exactRevision && heldAndPayable) {
      venueRevision += 1;
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'cancelled', matchSettlementRevision: venueRevision, matchSettlementAttemptId: null },
      });
      if (booking.holdId) await tx.hold.deleteMany({ where: { id: booking.holdId } });
      winningAttemptId = null;
      decision = 'cancelled';
    } else if (booking.status === 'confirmed' || booking.status === 'completed') {
      decision = 'confirmed';
    } else if (booking.status === 'cancelled' || !heldAndPayable) {
      decision = 'cancelled';
    } else {
      decision = 'held_revoked';
    }

    const result: MatchBookingResolutionPayload = {
      commandId: command.commandId,
      matchId: command.matchId,
      bookingId: booking.id,
      attemptId: command.attemptId,
      action: command.action,
      decision,
      winningAttemptId,
      venueRevision,
    };
    await tx.matchBookingCommand.create({
      data: {
        commandId: command.commandId,
        bookingId: booking.id,
        matchId: command.matchId,
        attemptId: command.attemptId,
        action: command.action,
        expectedVenueRevision: command.venueRevision,
        decision,
        winningAttemptId,
        venueRevision,
      },
    });
    await writeOutbox(tx, {
      aggregateType: 'Booking', aggregateId: booking.id, eventType: 'MatchBookingResolved', payload: result,
    });
    return result;
  });
}

/** P2-M3: whole-match cancellation releases a still-held court booking and
 * its physical hold. Confirmed bookings are cancelled only through the
 * authenticated GĐ1 cancellation policy endpoint (D33). */
export async function releaseHeldMatchBooking(eventId: string, payload: MatchCancelledPayload) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.bookingId}, 0))`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    const booking = await tx.booking.findUnique({ where: { id: payload.bookingId } });
    if (booking?.status === 'held') {
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } });
      if (booking.holdId) await tx.hold.deleteMany({ where: { id: booking.holdId } });
    } else if (booking?.status === 'confirmed' && payload.reason !== 'confirmed_booking_policy') {
      throw new Error('Collecting MatchCancelled cannot release a confirmed booking');
    }
    await tx.processedEvent.create({ data: { eventId } });
  });
}

/** BOK-08 — booking của chính người chơi (không gồm booking nội bộ, AC-08-5). */
export async function listMyBookings(userId: string) {
  const bookings = await prisma.booking.findMany({
    where: { userId, source: 'marketplace' },
    orderBy: { startAt: 'desc' },
    include: { court: { include: { venue: true } } },
  });
  const now = Date.now();
  return {
    upcoming: bookings.filter((b) => b.startAt.getTime() >= now),
    past: bookings.filter((b) => b.startAt.getTime() < now),
  };
}

/** AC-08-2/3/4: chi tiết một booking — CHỈ chủ booking mới xem được. */
export async function getMyBookingDetail(userId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { court: { include: { venue: true } } } });
  if (!booking || booking.source !== 'marketplace') {
    throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);
  }
  if (booking.userId !== userId) {
    throw new AppError('FORBIDDEN', 'Không có quyền xem booking này.', 403); // BR-BOK-10
  }
  const hoursUntilStart = (booking.startAt.getTime() - Date.now()) / 3_600_000;
  // BR-BOK-06: đọc từ policySnapshot của CHÍNH booking, không phải hằng hiện hành.
  return {
    booking: {
      ...booking,
      terminalStatus: booking.status === 'confirmed' || booking.status === 'cancelled' ? booking.status : null,
    },
    expectedRefundPercent: getRefundPercentageFromSnapshot(booking.policySnapshot, hoursUntilStart),
    courtChangeNote: booking.courtChangedAt ? 'Booking đã được phía sân chuyển sang sân con khác.' : null,
  };
}
