import { createHash } from 'node:crypto';
import type { Prisma, ShutdownMode, ShutdownScopeType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { lockCourtSchedule } from '../lib/courtScheduleLock.js';
import { writeOutbox } from '../lib/outbox.js';
import { canCommitDuringShutdown, canTransitionShutdown, scheduledCloseInstant } from './operationalShutdownPolicy.js';
import { HttpShutdownRefundPreviewClient, type ShutdownRefundPreviewClient } from '../clients/finance.js';
import { bookingCancelledPayload } from './operationalShutdownEvents.js';

type Tx = Prisma.TransactionClient;
const playerDateTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const playerDate = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
});
export type ShutdownScope = { type: ShutdownScopeType; id: string };
export type ShutdownActor = { userId: string; roles: readonly string[] };
export type ShutdownRequest = {
  mode: ShutdownMode;
  closeDate?: string;
  reason?: string;
};

export async function lockShutdownScope(tx: Tx, scope: ShutdownScope): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`shutdown-scope:${scope.type}:${scope.id}`}, 0))`;
}

async function authorizedCourtIds(tx: Tx, actor: ShutdownActor, scope: ShutdownScope): Promise<string[]> {
  const isAdmin = actor.roles.includes('admin');
  if (scope.type === 'court') {
    const court = await tx.court.findUnique({
      where: { id: scope.id },
      include: { venue: { include: { provider: true } } },
    });
    if (!court) throw new AppError('COURT_NOT_FOUND', 'Không tìm thấy sân.', 404);
    if (!isAdmin && court.venue.provider.userId !== actor.userId) {
      throw new AppError('FORBIDDEN_NOT_OWNER', 'Không có quyền quản lý sân này.', 403);
    }
    return [court.id];
  }
  const venue = await tx.venue.findUnique({
    where: { id: scope.id },
    include: { provider: true, courts: { select: { id: true } } },
  });
  if (!venue) throw new AppError('VENUE_NOT_FOUND', 'Không tìm thấy cơ sở.', 404);
  if (!isAdmin && venue.provider.userId !== actor.userId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Không có quyền quản lý cơ sở này.', 403);
  }
  return venue.courts.map((court) => court.id).sort();
}

function effectiveAtFor(input: ShutdownRequest, now: Date): Date | null {
  if (input.mode === 'winding_down') return null;
  if (input.mode === 'emergency') {
    if (!input.reason?.trim()) throw new AppError('SHUTDOWN_REASON_REQUIRED', 'Vui lòng cho biết lý do sự cố.', 400);
    return now;
  }
  if (!input.closeDate) throw new AppError('CLOSE_DATE_REQUIRED', 'Vui lòng chọn ngày đóng cửa.', 400);
  let cutoff: Date;
  try {
    cutoff = scheduledCloseInstant(input.closeDate);
  } catch {
    throw new AppError('INVALID_CLOSE_DATE', 'Ngày đóng cửa không hợp lệ.', 400);
  }
  if (cutoff <= now) throw new AppError('CLOSE_DATE_IN_PAST', 'Vui lòng chọn một ngày đóng cửa trong tương lai.', 400);
  return cutoff;
}

async function impactSnapshot(tx: Tx, courtIds: string[], input: ShutdownRequest, now: Date, existingShutdownId?: string, existingModeStartedAt?: Date) {
  const effectiveAt = effectiveAtFor(input, now);
  const bookings = courtIds.length ? await tx.booking.findMany({
    where: { courtId: { in: courtIds }, status: { in: ['held', 'confirmed'] }, endAt: { gt: now } },
    select: {
      id: true, courtId: true, source: true, status: true, endAt: true, holdPurposeSnapshot: true,
      priceSnapshot: true, holdId: true, holdExpiresAt: true,
      matchCommands: { select: { matchId: true }, take: 1 },
      shutdownItems: { select: { id: true }, take: 1 },
    },
    orderBy: { id: 'asc' },
  }) : [];
  const holds = courtIds.length ? await tx.hold.findMany({
    where: { courtId: { in: courtIds }, expiresAt: { gt: now } },
    select: { id: true, purpose: true, endAt: true, expiresAt: true, createdAt: true },
    orderBy: { id: 'asc' },
  }) : [];
  const affected = effectiveAt ? bookings.filter((booking) => booking.endAt > effectiveAt && booking.shutdownItems.length === 0) : [];
  const affectedHolds = effectiveAt ? holds.filter((hold) => hold.endAt > effectiveAt) : [];
  const expectedInactiveAt = input.mode === 'winding_down'
    ? [...bookings.map((booking) => booking.endAt), ...holds.map((hold) => hold.endAt)].reduce<Date | null>(
      (latest, endAt) => !latest || endAt > latest ? endAt : latest, null,
    ) ?? now
    : effectiveAt;
  const continuingBookings = bookings.filter((booking) => booking.shutdownItems.length === 0
    && (input.mode === 'winding_down' || !effectiveAt || booking.endAt <= effectiveAt)).length;
  const estimatedRefund = affected.reduce((sum, booking) =>
    booking.source === 'marketplace' && booking.status === 'confirmed' ? sum + booking.priceSnapshot : sum, 0n);
  const token = createHash('sha256').update(JSON.stringify({
    mode: input.mode, effectiveAt: input.mode === 'emergency' ? null : effectiveAt?.toISOString() ?? null,
    existingShutdownId, existingModeStartedAt: existingModeStartedAt?.toISOString() ?? null,
    bookings: bookings.map((booking) => [booking.id, booking.status, booking.endAt.toISOString(), booking.priceSnapshot.toString(), booking.holdPurposeSnapshot, booking.shutdownItems.length]),
    holds: holds.map((hold) => [hold.id, hold.purpose, hold.endAt.toISOString(), hold.expiresAt.toISOString()]),
  })).digest('hex');
  return {
    effectiveAt, expectedInactiveAt, bookings, holds, affected, affectedHolds, estimatedRefund,
    preview: {
      affectedMarketplace: affected.filter((booking) => booking.source === 'marketplace'
        && booking.holdPurposeSnapshot !== 'match' && booking.matchCommands.length === 0).length,
      affectedMatch: affected.filter((booking) => booking.holdPurposeSnapshot === 'match' || booking.matchCommands.length > 0).length,
      affectedInternal: affected.filter((booking) => booking.source === 'internal').length,
      activeCheckoutHolds: holds.filter((hold) => hold.purpose === 'checkout').length,
      activeMatchHolds: holds.filter((hold) => hold.purpose === 'match').length,
      existingConfirmedBookings: bookings.filter((booking) => booking.status === 'confirmed').length,
      continuingBookings,
      closeAt: input.mode === 'scheduled_close' ? effectiveAt?.toISOString() ?? null : null,
      estimatedRefund: estimatedRefund.toString(),
      estimatedRefundExcludesUnsettledMatches: affected.some((booking) => booking.status === 'held'),
      expectedInactiveAt: expectedInactiveAt?.toISOString() ?? null,
      effectiveAt: effectiveAt?.toISOString() ?? null,
      previewToken: token,
    },
  };
}

export async function previewOperationalShutdown(
  actor: ShutdownActor,
  scope: ShutdownScope,
  input: ShutdownRequest,
  financeClient: ShutdownRefundPreviewClient = new HttpShutdownRefundPreviewClient(),
) {
  const impact = await prisma.$transaction(async (tx) => {
    const courtIds = await authorizedCourtIds(tx, actor, scope);
    const current = await tx.operationalShutdown.findFirst({ where: { scopeType: scope.type, scopeId: scope.id, endedAt: null } });
    if (current && !canTransitionShutdown(current.mode, input.mode)) {
      throw new AppError('SHUTDOWN_MODE_FINAL', 'Sân đã ngừng hoạt động do sự cố. Hãy kích hoạt lại khi có thể phục vụ.', 409);
    }
    return impactSnapshot(tx, courtIds, input, new Date(), current?.id, current?.modeStartedAt);
  });
  const heldMarketplaceIds = impact.affected
    .filter((booking) => booking.source === 'marketplace' && booking.status === 'held')
    .map((booking) => booking.id);
  let paidAmounts: Record<string, string>;
  try {
    paidAmounts = await financeClient.getPaidAmounts(heldMarketplaceIds);
  } catch {
    throw new AppError('FINANCE_PREVIEW_UNAVAILABLE', 'Chưa thể tính tổng tiền hoàn. Vui lòng thử lại.', 503);
  }
  let heldPaidGross = 0n;
  for (const bookingId of heldMarketplaceIds) {
    const amount = paidAmounts[bookingId];
    if (typeof amount !== 'string' || !/^\d+$/.test(amount)) {
      throw new AppError('FINANCE_PREVIEW_UNAVAILABLE', 'Chưa thể tính tổng tiền hoàn. Vui lòng thử lại.', 503);
    }
    heldPaidGross += BigInt(amount);
  }
  return {
    ...impact.preview,
    estimatedRefund: (impact.estimatedRefund + heldPaidGross).toString(),
    estimatedRefundExcludesUnsettledMatches: false,
  };
}

export async function getOperationalShutdownStatus(actor: ShutdownActor, scope: ShutdownScope) {
  return prisma.$transaction(async (tx) => {
    await authorizedCourtIds(tx, actor, scope);
    const current = await tx.operationalShutdown.findFirst({
      where: { scopeType: scope.type, scopeId: scope.id, endedAt: null },
      include: { items: { select: { status: true } } },
    });
    if (!current) return null;
    const counts = current.items.reduce<Record<string, number>>((result, item) => {
      result[item.status] = (result[item.status] ?? 0) + 1;
      return result;
    }, {});
    const { items: _items, originallyActiveCourtIds: _original, ...publicStatus } = current;
    return { ...publicStatus, counts };
  });
}

export async function reactivateOperationalShutdown(actor: ShutdownActor, scope: ShutdownScope) {
  return prisma.$transaction(async (tx) => {
    await lockShutdownScope(tx, scope);
    const courtIds = await authorizedCourtIds(tx, actor, scope);
    for (const courtId of courtIds) await lockCourtSchedule(tx, courtId);
    const current = await tx.operationalShutdown.findFirst({ where: { scopeType: scope.type, scopeId: scope.id, endedAt: null } });
    if (!current) throw new AppError('SHUTDOWN_NOT_FOUND', 'Sân hoặc cơ sở không có lịch ngừng hoạt động.', 404);
    if (current.operationalStatus !== 'inactive') {
      throw new AppError('SHUTDOWN_NOT_INACTIVE', 'Sân vẫn đang trong quá trình phục vụ các lịch đặt hiện có.', 409);
    }
    if (await tx.operationalShutdownItem.count({ where: { shutdownId: current.id,
      OR: [
        { status: { in: ['identified', 'cancellation_processing'] } },
        { status: 'needs_attention', booking: { status: { in: ['held', 'confirmed'] } } },
      ],
    } })) {
      throw new AppError('SHUTDOWN_CANCELLATION_IN_PROGRESS', 'Vui lòng đợi hệ thống hủy xong các lịch bị ảnh hưởng trước khi kích hoạt lại.', 409);
    }
    const originalIds = Array.isArray(current.originallyActiveCourtIds)
      ? current.originallyActiveCourtIds.filter((id): id is string => typeof id === 'string' && courtIds.includes(id)) : [];
    await tx.operationalShutdown.update({ where: { id: current.id }, data: { endedAt: new Date(), endedByUserId: actor.userId } });
    let restoredCourtCount = 0;
    for (const courtId of originalIds) {
      const venueId = (await tx.court.findUniqueOrThrow({ where: { id: courtId } })).venueId;
      const other = await tx.operationalShutdown.findFirst({ where: { endedAt: null, OR: [
        { scopeType: 'court', scopeId: courtId }, { scopeType: 'venue', scopeId: venueId },
      ] } });
      if (!other) {
        await tx.court.update({ where: { id: courtId }, data: { active: true } });
        restoredCourtCount += 1;
      }
    }
    return { status: 'active' as const, restoredCourtCount };
  }, { timeout: 30_000 });
}

export async function confirmOperationalShutdown(
  actor: ShutdownActor, scope: ShutdownScope, input: ShutdownRequest, previewToken: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    await lockShutdownScope(tx, scope);
    const courtIds = await authorizedCourtIds(tx, actor, scope);
    // The same lock order as court booking/hold commands: snapshot and cutoff are atomic.
    for (const courtId of courtIds) await lockCourtSchedule(tx, courtId);
    const now = new Date();
    const current = await tx.operationalShutdown.findFirst({ where: { scopeType: scope.type, scopeId: scope.id, endedAt: null } });
    if (current && !canTransitionShutdown(current.mode, input.mode)) {
      throw new AppError('SHUTDOWN_MODE_FINAL', 'Sân đã ngừng hoạt động do sự cố. Hãy kích hoạt lại khi có thể phục vụ.', 409);
    }
    const impact = await impactSnapshot(tx, courtIds, input, now, current?.id, current?.modeStartedAt);
    if (impact.preview.previewToken !== previewToken) {
      throw new AppError('SHUTDOWN_PREVIEW_CHANGED', 'Lịch đặt đã thay đổi. Vui lòng xem lại ảnh hưởng trước khi xác nhận.', 409);
    }
    const data = {
      mode: input.mode,
      modeStartedAt: now,
      operationalStatus: input.mode === 'emergency' ? 'inactive' as const : input.mode,
      resolutionStatus: current?.resolutionStatus === 'needs_attention' ? 'needs_attention' as const
        : impact.affected.length > 0 ? 'processing' as const : current?.resolutionStatus ?? 'not_required' as const,
      effectiveAt: impact.effectiveAt,
      expectedInactiveAt: impact.expectedInactiveAt,
      reason: input.reason?.trim() || null,
    };
    const originallyActiveCourtIds = current ? null : (await tx.court.findMany({
      where: { id: { in: courtIds }, active: true }, select: { id: true },
    })).map((court) => court.id);
    const shutdown = current
      ? await tx.operationalShutdown.update({ where: { id: current.id }, data })
      : await tx.operationalShutdown.create({ data: {
        scopeType: scope.type, scopeId: scope.id, createdByUserId: actor.userId,
        originallyActiveCourtIds: originallyActiveCourtIds!, ...data,
      } });
    if (impact.affected.length) {
      await tx.operationalShutdownItem.createMany({
        data: impact.affected.map((booking) => ({ shutdownId: shutdown.id, bookingId: booking.id, mode: input.mode, effectiveAt: impact.effectiveAt! })),
        skipDuplicates: true,
      });
    }
    if (impact.affectedHolds.length) {
      const bookingHoldIds = new Set(impact.bookings.flatMap((booking) => booking.holdId ? [booking.holdId] : []));
      await tx.hold.deleteMany({ where: { id: { in: impact.affectedHolds
        .filter((hold) => !bookingHoldIds.has(hold.id)).map((hold) => hold.id) } } });
    }
    if (input.mode === 'emergency' && courtIds.length) {
      await tx.court.updateMany({ where: { id: { in: courtIds } }, data: { active: false } });
    }
    await tx.operationalShutdownTransition.create({ data: {
      shutdownId: shutdown.id, fromMode: current?.mode ?? null, toMode: input.mode,
      previousEffectiveAt: current?.effectiveAt ?? null, effectiveAt: impact.effectiveAt,
      newlyAffectedCount: impact.affected.length, estimatedRefundGross: impact.estimatedRefund,
      actorUserId: actor.userId, reason: input.reason?.trim() || null,
    } });
    return { shutdown, preview: impact.preview };
  }, { timeout: 30_000 });
  // Start cancellations before responding. A background drain and the durable
  // scheduler cover large batches or process restarts without a long DB tx.
  await processOperationalShutdownItems(25, result.shutdown.id);
  if (result.preview.affectedMarketplace + result.preview.affectedMatch + result.preview.affectedInternal > 25) {
    setImmediate(() => { void drainShutdownItems(result.shutdown.id).catch((error) => console.error('[shutdown-drain]', error)); });
  }
  return result;
}

async function drainShutdownItems(shutdownId: string): Promise<void> {
  while (await processOperationalShutdownItems(25, shutdownId)) {
    // Keep the batch bounded; a new scheduling tick may run concurrently.
  }
}

/** Called only after the court-schedule lock has been acquired by the command. */
export async function assertCourtAcceptsCommitment(
  tx: Tx, courtId: string, endAt: Date, existingCreatedAt?: Date,
): Promise<void> {
  const court = await tx.court.findUnique({ where: { id: courtId }, select: { venueId: true } });
  if (!court) throw new AppError('COURT_NOT_FOUND', 'Không tìm thấy sân.', 404);
  const shutdowns = await tx.operationalShutdown.findMany({
    where: { endedAt: null, OR: [
      { scopeType: 'court', scopeId: courtId },
      { scopeType: 'venue', scopeId: court.venueId },
    ] },
  });
  for (const shutdown of shutdowns) {
    if (!canCommitDuringShutdown({ ...shutdown, createdAt: shutdown.modeStartedAt }, endAt, existingCreatedAt)) {
      throw new AppError('COURT_SHUTTING_DOWN', 'Sân không nhận lịch đặt cho khung giờ này.', 409);
    }
  }
}

/** Read-side hint only. Command handlers still acquire the court lock and
 * call assertCourtAcceptsCommitment before changing availability. */
export async function canOfferCourtSlot(courtId: string, endAt: Date): Promise<boolean> {
  const court = await prisma.court.findUnique({ where: { id: courtId }, select: { venueId: true, active: true } });
  if (!court?.active) return false;
  const shutdowns = await prisma.operationalShutdown.findMany({ where: { endedAt: null, OR: [
    { scopeType: 'court', scopeId: courtId }, { scopeType: 'venue', scopeId: court.venueId },
  ] } });
  return shutdowns.every((shutdown) => canCommitDuringShutdown({ ...shutdown, createdAt: shutdown.modeStartedAt }, endAt));
}

/** Each item commits its booking mutation and outbox effects together. Replays
 * see the terminal item state under the booking lock and cannot refund twice. */
async function processShutdownItem(itemId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const initial = await tx.operationalShutdownItem.findUnique({ where: { id: itemId } });
    if (!initial || initial.status !== 'identified') return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.bookingId}, 0))`;
    const item = await tx.operationalShutdownItem.findUniqueOrThrow({ where: { id: itemId } });
    if (item.status !== 'identified') return;
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: item.bookingId },
      include: {
        court: { include: { venue: { include: { provider: true } } } },
        matchCommands: { select: { matchId: true }, take: 1 },
      },
    });
    if (booking.endAt <= item.effectiveAt) {
      throw new Error('Shutdown item no longer matches its captured cutoff');
    }
    if (booking.status !== 'held' && booking.status !== 'confirmed') {
      throw new Error(`Shutdown item booking already left active state: ${booking.status}`);
    }
    const hold = booking.holdId ? await tx.hold.findUnique({ where: { id: booking.holdId } }) : null;
    const wasConfirmed = booking.status === 'confirmed';
    const wasMatchHold = hold?.purpose === 'match' || booking.holdPurposeSnapshot === 'match' || booking.matchCommands.length > 0;
    await tx.booking.update({ where: { id: booking.id }, data: {
      status: 'cancelled', cancellationReason: 'provider_fault', cancellationRefundPercent: 100,
      matchSettlementRevision: { increment: 1 }, matchSettlementAttemptId: null,
    } });
    if (booking.holdId) await tx.hold.deleteMany({ where: { id: booking.holdId } });
    const kind = item.mode === 'emergency' ? 'booking.shutdown_emergency' : 'booking.shutdown_scheduled';
    const cancellationMode = item.mode === 'emergency' ? 'emergency' as const : 'scheduled_close' as const;
    if (booking.source === 'marketplace' && booking.userId) {
      if (wasConfirmed) {
        await writeOutbox(tx, { aggregateType: 'Booking', aggregateId: booking.id, eventType: 'BookingCancelled', payload: bookingCancelledPayload({
          bookingId: booking.id, userId: booking.userId,
          businessUserId: booking.court.venue.provider.userId,
          gross: booking.priceSnapshot.toString(), mode: cancellationMode,
          shutdownId: item.shutdownId, bookingBusinessCode: booking.businessCode,
        }) });
      }
      await writeOutbox(tx, { aggregateType: 'Booking', aggregateId: booking.id,
        eventType: 'ShutdownBookingCancellationRequested', payload: {
          bookingId: booking.id, shutdownId: item.shutdownId, mode: item.mode,
          bookingBusinessCode: booking.businessCode, wasConfirmed,
        },
      });
      await writeOutbox(tx, { aggregateType: 'Notification', aggregateId: `${kind}:${booking.id}`,
        eventType: 'UserNotificationRequested', payload: {
          recipient: { type: 'user', userId: booking.userId, targetRole: 'player' },
          category: 'booking', kind, deliveryPolicy: 'required', bookingBusinessCode: booking.businessCode,
          title: 'Lịch đặt đã được hủy',
          body: (`Lịch ${booking.businessCode} ngày ${playerDateTime.format(booking.startAt)} tại ${booking.court.venue.name} · ${booking.court.name} đã hủy ${item.mode === 'emergency' ? 'do sự cố' : `vì cơ sở đóng từ ${playerDate.format(item.effectiveAt)}`}. Bạn được hoàn 100% nếu đã thanh toán.`).slice(0, 240),
          priority: 'update', entityType: 'booking', entityId: booking.id,
          actionKind: 'booking.view', actionExpiresAt: null,
        },
      });
    }
    const status = item.refundCompletedAt ? 'refunded'
      : booking.source === 'internal' ? 'cancelled_no_platform_refund'
        : wasConfirmed || wasMatchHold ? 'cancelled_refund_processing' : 'cancelled_unpaid';
    const refundPath = booking.source === 'internal' || !wasConfirmed && !wasMatchHold ? 'none'
      : wasConfirmed ? 'booking' : 'match';
    await tx.operationalShutdownItem.update({ where: { id: item.id }, data: {
      status, refundPath, attempts: { increment: 1 }, lastError: null,
      nextAttemptAt: status === 'cancelled_refund_processing' ? new Date(Date.now() + 60_000) : null,
    } });
  });
}

export async function processOperationalShutdownItems(limit = 25, shutdownId?: string): Promise<number> {
  const candidates = await prisma.operationalShutdownItem.findMany({
    where: { ...(shutdownId ? { shutdownId } : {}), status: 'identified',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
    orderBy: { createdAt: 'asc' }, take: limit, select: { id: true, attempts: true },
  });
  for (const candidate of candidates) {
    try {
      await processShutdownItem(candidate.id);
    } catch (error) {
      const nextAttempts = candidate.attempts + 1;
      await prisma.operationalShutdownItem.updateMany({ where: { id: candidate.id, status: 'identified' }, data: {
        status: nextAttempts >= 3 ? 'needs_attention' : 'identified',
        attempts: { increment: 1 },
        nextAttemptAt: nextAttempts >= 3 ? null : new Date(Date.now() + 30_000 * nextAttempts),
        lastError: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
      } });
    }
  }
  return candidates.length;
}

export async function retryPendingShutdownRefunds(now = new Date(), limit = 25): Promise<number> {
  const candidates = await prisma.operationalShutdownItem.findMany({ where: {
    status: 'cancelled_refund_processing', nextAttemptAt: { lte: now },
  }, orderBy: { nextAttemptAt: 'asc' }, take: limit, select: { id: true } });
  for (const candidate of candidates) {
    await prisma.$transaction(async (tx) => {
      const item = await tx.operationalShutdownItem.findUnique({ where: { id: candidate.id },
        include: { booking: { include: { court: { include: { venue: { include: { provider: true } } } } } } },
      });
      if (!item || item.status !== 'cancelled_refund_processing' || !item.nextAttemptAt || item.nextAttemptAt > now) return;
      if (item.attempts >= 3) {
        const changed = await tx.operationalShutdownItem.updateMany({ where: { id: item.id, status: 'cancelled_refund_processing' },
          data: { status: 'needs_attention', nextAttemptAt: null, lastError: 'Refund completion was not received after retries' },
        });
        if (changed.count) await writeOutbox(tx, { aggregateType: 'Notification', aggregateId: `shutdown.needs_attention:${item.id}`,
          eventType: 'UserNotificationRequested', payload: {
            recipient: { type: 'role', targetRole: 'admin' }, category: 'finance',
            kind: 'finance.shutdown_refund_needs_attention', deliveryPolicy: 'required',
            bookingBusinessCode: item.booking.businessCode,
            title: 'Một khoản hoàn cần được hỗ trợ',
            body: `Vui lòng kiểm tra khoản hoàn cho lịch đặt ${item.booking.businessCode}.`,
            priority: 'action_required', entityType: 'booking', entityId: item.bookingId,
            actionKind: 'booking.view', actionExpiresAt: null,
          },
        });
        return;
      }
      if (item.refundPath === 'booking' && item.booking.userId) {
        await writeOutbox(tx, { aggregateType: 'Booking', aggregateId: item.bookingId, eventType: 'BookingCancelled', payload: bookingCancelledPayload({
          bookingId: item.bookingId, userId: item.booking.userId,
          businessUserId: item.booking.court.venue.provider.userId,
          gross: item.booking.priceSnapshot.toString(), mode: item.mode === 'emergency' ? 'emergency' : 'scheduled_close',
          shutdownId: item.shutdownId, bookingBusinessCode: item.booking.businessCode,
        }) });
      } else if (item.refundPath === 'match') {
        await writeOutbox(tx, { aggregateType: 'Booking', aggregateId: item.bookingId,
          eventType: 'ShutdownBookingCancellationRequested', payload: {
            bookingId: item.bookingId, shutdownId: item.shutdownId, mode: item.mode,
            bookingBusinessCode: item.booking.businessCode, wasConfirmed: false,
          },
        });
      }
      await tx.operationalShutdownItem.update({ where: { id: item.id }, data: {
        attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + 60_000),
      } });
    });
  }
  return candidates.length;
}

export async function recordShutdownRefundCompleted(eventId: string, payload: { bookingId: string; shutdownId: string }) {
  await prisma.$transaction(async (tx) => {
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;
    await tx.operationalShutdownItem.updateMany({
      where: { shutdownId: payload.shutdownId, bookingId: payload.bookingId },
      data: { refundCompletedAt: new Date() },
    });
    await tx.operationalShutdownItem.updateMany({
      where: {
        shutdownId: payload.shutdownId,
        bookingId: payload.bookingId,
        status: { in: ['cancelled_refund_processing', 'cancelled_unpaid', 'needs_attention'] },
      },
      data: { status: 'refunded' },
    });
    await tx.processedEvent.create({ data: { eventId } });
  });
}

export async function refreshOperationalShutdownStatus(shutdownId: string, now = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const initial = await tx.operationalShutdown.findUnique({ where: { id: shutdownId } });
    if (!initial || initial.endedAt) return;

    await lockShutdownScope(tx, { type: initial.scopeType, id: initial.scopeId });
    const shutdown = await tx.operationalShutdown.findUnique({ where: { id: shutdownId } });
    if (!shutdown || shutdown.endedAt) return;

    const courtIds = shutdown.scopeType === 'court'
      ? [shutdown.scopeId]
      : (await tx.court.findMany({ where: { venueId: shutdown.scopeId }, select: { id: true } }))
        .map((court) => court.id).sort();
    for (const courtId of courtIds) await lockCourtSchedule(tx, courtId);

    const items = await tx.operationalShutdownItem.findMany({
      where: { shutdownId: shutdown.id },
      select: { status: true },
    });
    const terminal = new Set(['refunded', 'cancelled_no_platform_refund', 'cancelled_unpaid']);
    const resolutionStatus = items.length === 0 ? 'not_required'
      : items.some((item) => item.status === 'needs_attention') ? 'needs_attention'
        : items.every((item) => terminal.has(item.status)) ? 'completed' : 'processing';

    let operationalStatus = shutdown.operationalStatus;
    if (shutdown.mode === 'scheduled_close' && shutdown.effectiveAt && shutdown.effectiveAt <= now) {
      operationalStatus = 'inactive';
    }
    if (shutdown.mode === 'winding_down' && courtIds.length) {
      const [remainingBookings, remainingHolds] = await Promise.all([
        tx.booking.count({ where: { courtId: { in: courtIds }, status: { in: ['held', 'confirmed'] }, endAt: { gt: now } } }),
        tx.hold.count({ where: { courtId: { in: courtIds }, expiresAt: { gt: now } } }),
      ]);
      if (remainingBookings === 0 && remainingHolds === 0) operationalStatus = 'inactive';
    }

    if (operationalStatus === 'inactive' && shutdown.operationalStatus !== 'inactive' && courtIds.length) {
      await tx.court.updateMany({ where: { id: { in: courtIds } }, data: { active: false } });
    }
    if (resolutionStatus !== shutdown.resolutionStatus || operationalStatus !== shutdown.operationalStatus) {
      await tx.operationalShutdown.updateMany({
        where: {
          id: shutdown.id,
          endedAt: null,
          mode: shutdown.mode,
          modeStartedAt: shutdown.modeStartedAt,
        },
        data: { resolutionStatus, operationalStatus },
      });
    }
  });
}

export async function refreshOperationalShutdownStatuses(now = new Date()): Promise<void> {
  const shutdowns = await prisma.operationalShutdown.findMany({
    where: { endedAt: null },
    select: { id: true },
  });
  for (const { id } of shutdowns) await refreshOperationalShutdownStatus(id, now);
}
