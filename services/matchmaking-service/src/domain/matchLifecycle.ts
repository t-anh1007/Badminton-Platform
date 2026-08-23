import { randomUUID } from 'node:crypto';
import type { MatchBookingResolutionPayload, MatchCancelledPayload, MatchFeeRefundRequestedPayload } from '@khoaluantn/shared';
import type { VenueBookingClient } from '../clients/venueBooking.js';
import { HttpVenueBookingClient } from '../clients/venueBooking.js';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';
import { prisma } from '../lib/prisma.js';

type CancelReason = 'organizer' | 'cutoff';
type ResolutionAction = 'withdraw' | 'cancel';

/** Persist the player/organizer's logical action before touching Venue. The
 * returned receipt is reused after an HTTP timeout, so retries cannot create a
 * second race participant. */
async function beginResolution(
  matchId: string,
  action: ResolutionAction,
  joinId?: string,
  cancelReason?: CancelReason,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${matchId}, 0))`;
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y kÃ¨o.');
    const pending = await tx.matchResolution.findFirst({
      where: { matchId, joinId: joinId ?? null, action, decision: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    if (pending) return { match, resolution: pending };
    const resolution = await tx.matchResolution.create({
      data: {
        commandId: randomUUID(),
        matchId,
        joinId,
        action,
        cancelReason,
        attemptId: match.settlementAttemptId,
        venueRevision: match.settlementVenueRevision,
      },
    });
    return { match, resolution };
  });
}

/** Apply the durable venue result once. It is exported for MatchBookingResolved
 * recovery consumption as well as the synchronous HTTP seam. */
export async function applyMatchBookingResolution(
  payload: MatchBookingResolutionPayload,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payload.matchId}, 0))`;
    const resolution = await tx.matchResolution.findUnique({ where: { commandId: payload.commandId } });
    if (!resolution || resolution.matchId !== payload.matchId) return { applied: false, refunded: false };
    if (resolution.decision !== 'pending') return { applied: false, refunded: false };
    const match = await tx.match.findUniqueOrThrow({ where: { id: payload.matchId } });
    if (match.bookingId !== payload.bookingId || resolution.action !== payload.action) {
      throw new Error('Venue result does not match persisted resolution');
    }
    await tx.matchResolution.update({
      where: { commandId: resolution.commandId },
      data: { decision: payload.decision, resolvedAt: now },
    });

    const revision = Math.max(match.settlementVenueRevision, payload.venueRevision);
    if (resolution.action === 'withdraw') {
      const join = resolution.joinId ? await tx.join.findUnique({ where: { id: resolution.joinId } }) : null;
      if (!join || join.matchId !== match.id) throw new Error('Withdrawal resolution has no matching join');
      if (payload.decision === 'held_revoked') {
        const refundable = join.status === 'confirmed'
          && join.feePaidAt !== null
          && resolution.createdAt < match.cutoffAt;
        if (join.status === 'approved' || join.status === 'confirmed') {
          await tx.join.update({ where: { id: join.id }, data: { status: 'withdrawn' } });
        }
        if (refundable) {
          await writeOutbox(tx, {
            aggregateType: 'Join', aggregateId: join.id, eventType: 'MatchFeeRefundRequested',
            payload: {
              matchId: match.id, joinId: join.id, participantUserId: join.participantUserId,
              reason: 'withdraw_before_cutoff',
            } satisfies MatchFeeRefundRequestedPayload,
          });
        }
        await tx.match.update({
          where: { id: match.id },
          data: {
            status: match.status === 'filled' ? 'open' : match.status,
            fundingRequestedAt: match.settlementAttemptId === resolution.attemptId ? null : match.fundingRequestedAt,
            settlementAttemptId: match.settlementAttemptId === resolution.attemptId ? null : match.settlementAttemptId,
            settlementVenueRevision: revision,
          },
        });
        return { applied: true, refunded: refundable };
      }
      if (payload.decision === 'confirmed') {
        if (join.status === 'approved' || join.status === 'confirmed') {
          await tx.join.update({ where: { id: join.id }, data: { status: 'withdrawn' } });
        }
        await tx.match.update({
          where: { id: match.id },
          data: { status: 'confirmed', settlementVenueRevision: revision },
        });
      }
      return { applied: true, refunded: false };
    }

    if (payload.decision === 'cancelled') {
      const paidJoins = await tx.join.findMany({
        where: { matchId: match.id, feePaidAt: { not: null } }, select: { id: true },
      });
      await tx.join.updateMany({
        where: { matchId: match.id, status: { in: ['pending', 'approved', 'confirmed'] } },
        data: { status: 'withdrawn' },
      });
      await tx.match.update({
        where: { id: match.id },
        data: {
          status: 'cancelled', fundingRequestedAt: null, settlementAttemptId: null,
          settlementVenueRevision: revision,
        },
      });
      await writeOutbox(tx, {
        aggregateType: 'Match', aggregateId: match.id, eventType: 'MatchCancelled',
        payload: {
          matchId: match.id, bookingId: match.bookingId,
          reason: (resolution.cancelReason ?? 'organizer') as CancelReason,
          paidJoinIds: paidJoins.map((join) => join.id),
        } satisfies MatchCancelledPayload,
      });
      return { applied: true, refunded: false };
    }
    if (payload.decision === 'confirmed') {
      await tx.match.update({
        where: { id: match.id }, data: { status: 'confirmed', settlementVenueRevision: revision },
      });
    } else if (payload.decision === 'held_revoked') {
      // A different held-booking action won this revision. Keep the whole
      // cancellation intent non-terminal, but advance its local fence so the
      // caller can rebase a fresh command instead of reporting a false 200.
      await tx.match.update({
        where: { id: match.id }, data: { settlementVenueRevision: revision },
      });
    }
    return { applied: true, refunded: false };
  });
}

export async function withdrawJoin(
  venueBookingClient: VenueBookingClient,
  matchId: string,
  joinId: string,
  participantUserId: string,
  now = new Date(),
) {
  // Validate ownership before recording a pending command. A prior pending
  // receipt is intentionally reusable after transport failure.
  const existingJoin = await prisma.join.findUnique({ where: { id: joinId } });
  if (!existingJoin || existingJoin.matchId !== matchId || existingJoin.participantUserId !== participantUserId) {
    throw new AppError(404, 'JOIN_NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y lÆ°á»£t tham gia cá»§a báº¡n.');
  }
  if (existingJoin.status !== 'approved' && existingJoin.status !== 'confirmed') {
    throw new AppError(409, 'JOIN_NOT_WITHDRAWABLE', 'LÆ°á»£t tham gia khÃ´ng thá»ƒ rÃºt á»Ÿ tráº¡ng thÃ¡i hiá»‡n táº¡i.');
  }
  const { match, resolution } = await beginResolution(matchId, 'withdraw', joinId);
  const result = await venueBookingClient.resolveMatchBooking({
    commandId: resolution.commandId, matchId, attemptId: resolution.attemptId,
    action: 'withdraw', venueRevision: resolution.venueRevision,
  }, match.bookingId);
  const applied = await applyMatchBookingResolution(result, now);
  const join = await prisma.join.findUniqueOrThrow({ where: { id: joinId } });
  return { ...join, refunded: applied.refunded };
}

async function cancelThroughVenue(
  venueBookingClient: VenueBookingClient,
  matchId: string,
  reason: CancelReason,
  now: Date,
) {
  // A participant withdrawal may have atomically revoked the exact revision
  // first. Rebase the already-persisted whole-match cancellation to the newer
  // Venue fence until this logical cancellation itself receives a terminal
  // answer; never return success while the match is still open and held.
  for (;;) {
    const { match, resolution } = await beginResolution(matchId, 'cancel', undefined, reason);
    const result = await venueBookingClient.resolveMatchBooking({
      commandId: resolution.commandId, matchId, attemptId: resolution.attemptId,
      action: 'cancel', venueRevision: resolution.venueRevision,
    }, match.bookingId);
    const applied = await applyMatchBookingResolution(result, now);
    if (result.decision !== 'held_revoked') return { result, applied };
  }
}

async function hasConfirmedPolicyCancellationIntent(matchId: string, reason: CancelReason) {
  return prisma.matchResolution.findFirst({
    where: { matchId, action: 'cancel', cancelReason: reason, decision: 'confirmed' },
    orderBy: { createdAt: 'desc' },
  });
}

async function finalizeConfirmedPolicyCancellation(
  venueBookingClient: VenueBookingClient,
  matchId: string,
  bookingId: string,
  authorization: string,
) {
  // Venue persists and replays its own policy result. This closes the crash
  // window after Venue cancellation but before Matchmaking emits its local
  // confirmed_booking_policy event.
  const { refundPercent } = await venueBookingClient.cancelConfirmedBooking(bookingId, authorization);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${matchId}, 0))`;
    const fresh = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
    if (fresh.status === 'cancelled') return fresh;
    const paidJoins = await tx.join.findMany({ where: { matchId, feePaidAt: { not: null } }, select: { id: true } });
    await tx.join.updateMany({
      where: { matchId, status: { in: ['pending', 'approved', 'confirmed'] } }, data: { status: 'withdrawn' },
    });
    const cancelled = await tx.match.update({ where: { id: matchId }, data: { status: 'cancelled' } });
    await writeOutbox(tx, {
      aggregateType: 'Match', aggregateId: matchId, eventType: 'MatchCancelled',
      payload: {
        matchId, bookingId, reason: 'confirmed_booking_policy',
        paidJoinIds: paidJoins.map((join) => join.id), refundPercent,
      } satisfies MatchCancelledPayload,
    });
    return cancelled;
  });
}

export async function cancelMatchByOrganizer(
  venueBookingClient: VenueBookingClient,
  matchId: string,
  organizerUserId: string,
  authorization: string,
  now = new Date(),
) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y kÃ¨o.');
  if (match.organizerUserId !== organizerUserId) {
    throw new AppError(403, 'MATCH_ORGANIZER_ONLY', 'Chá»‰ organizer Ä‘Æ°á»£c há»§y kÃ¨o.');
  }
  if (await hasConfirmedPolicyCancellationIntent(matchId, 'organizer')) {
    return finalizeConfirmedPolicyCancellation(venueBookingClient, matchId, match.bookingId, authorization);
  }
  const { result } = await cancelThroughVenue(venueBookingClient, matchId, 'organizer', now);
  if (result.decision !== 'confirmed') return prisma.match.findUniqueOrThrow({ where: { id: matchId } });

  // Confirmation won the venue lock, so whole-match cancellation must now use
  // the confirmed-booking policy (D33), not a held-match refund path.
  return finalizeConfirmedPolicyCancellation(venueBookingClient, matchId, match.bookingId, authorization);
}

export async function cancelMatchesAtCutoff(
  now = new Date(),
  venueBookingClient: VenueBookingClient = new HttpVenueBookingClient(),
): Promise<number> {
  // Include a persisted pending settlement attempt: Venue is the only place
  // that may choose whether cutoff cancellation or confirmation won.
  const matches = await prisma.match.findMany({
    where: { status: { in: ['open', 'filled'] }, cutoffAt: { lte: now } }, select: { id: true },
  });
  let cancelled = 0;
  for (const match of matches) {
    const { result } = await cancelThroughVenue(venueBookingClient, match.id, 'cutoff', now);
    if (result.decision === 'cancelled') cancelled += 1;
  }
  return cancelled;
}

/** PLAN_MATCH-DEPOSIT — hủy kèo `awaiting_deposit` mà chủ kèo không trả cọc kịp
 * cửa sổ checkout. Slot/booking do venue tự nhả (hold hết hạn); ở đây chỉ dọn
 * state matchmaking + báo finance đóng funding. Không đi qua saga venue vì
 * booking held có thể đã bị reap. */
const DEPOSIT_WINDOW_MINUTES = 12;
export async function cancelExpiredDepositMatches(now = new Date()): Promise<number> {
  const threshold = new Date(now.getTime() - DEPOSIT_WINDOW_MINUTES * 60_000);
  const stale = await prisma.match.findMany({
    where: { status: 'awaiting_deposit', createdAt: { lte: threshold } },
    select: { id: true, bookingId: true },
  });
  let cancelled = 0;
  for (const stub of stale) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${stub.id}, 0))`;
      const fresh = await tx.match.findUnique({ where: { id: stub.id } });
      if (!fresh || fresh.status !== 'awaiting_deposit') return;
      await tx.match.update({ where: { id: stub.id }, data: { status: 'cancelled' } });
      await writeOutbox(tx, {
        aggregateType: 'Match', aggregateId: stub.id, eventType: 'MatchCancelled',
        payload: {
          matchId: stub.id, bookingId: stub.bookingId, reason: 'cutoff', paidJoinIds: [],
        } satisfies MatchCancelledPayload,
      });
      cancelled += 1;
    });
  }
  return cancelled;
}

/** Sweep mặc định của scheduler: hủy kèo quá hạn tìm đối X (open/filled) VÀ kèo
 * chưa trả cọc quá cửa sổ checkout. */
async function sweepMatchDeadlines(): Promise<number> {
  const [atCutoff, unpaidDeposit] = await Promise.all([
    cancelMatchesAtCutoff(),
    cancelExpiredDepositMatches(),
  ]);
  return atCutoff + unpaidDeposit;
}

export function startMatchCutoffScheduler(
  intervalMs = 30_000,
  sweep: () => Promise<number> = sweepMatchDeadlines,
): () => Promise<void> {
  let inFlight: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = sweep()
      .then(() => undefined)
      .catch((error) => console.error('[matchmaking-service cutoff]', error))
      .finally(() => { inFlight = undefined; });
  }, intervalMs);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await inFlight;
  };
}
