import { prisma } from '../lib/prisma.js';
import { COMMISSION_RATE_PERCENT } from '../lib/constants.js';
import { postLedgerEntry } from './wallet.js';
import { z } from 'zod';
import { writeOutbox } from '../lib/outbox.js';
import type { Prisma } from '@prisma/client';

export interface BookingCancelledPayload {
  bookingId: string;
  userId: string;
  businessUserId: string;
  gross: string;
  refundPercent: number;
  reason: 'self' | 'provider_fault' | 'platform_admin';
  cancellationNote?: string;
  shutdownId?: string;
  bookingBusinessCode?: string;
}

const bookingCancelledSchema = z.object({
  bookingId: z.string().uuid(),
  userId: z.string().uuid(),
  businessUserId: z.string().uuid(),
  gross: z.string().regex(/^[1-9]\d*$/),
  refundPercent: z.number().int().min(0).max(100),
  reason: z.enum(['self', 'provider_fault', 'platform_admin']),
  cancellationNote: z.string().optional(),
  shutdownId: z.string().uuid().optional(),
  bookingBusinessCode: z.string().regex(/^BK-[0-9]{8}$/).optional(),
});

async function writeShutdownRefundCompletion(
  tx: Prisma.TransactionClient,
  payload: z.infer<typeof bookingCancelledSchema>,
  recipients: Array<{ userId: string; amount: bigint }>,
) {
  if (!payload.shutdownId) return;
  if (await tx.outbox.findFirst({ where: { aggregateType: 'Booking', aggregateId: payload.bookingId, eventType: 'BookingRefundCompleted' } })) return;
  await writeOutbox(tx, { aggregateType: 'Booking', aggregateId: payload.bookingId,
    eventType: 'BookingRefundCompleted', payload: { bookingId: payload.bookingId, shutdownId: payload.shutdownId },
  });
  for (const recipient of recipients.filter((item) => item.amount > 0n)) {
    await writeOutbox(tx, { aggregateType: 'Notification', aggregateId: `shutdown.refund:${payload.bookingId}:${recipient.userId}`,
      eventType: 'UserNotificationRequested', payload: {
        recipient: { type: 'user', userId: recipient.userId, targetRole: 'player' },
        category: 'finance', kind: 'finance.shutdown_refund_completed', deliveryPolicy: 'required',
        bookingBusinessCode: payload.bookingBusinessCode ?? null,
        title: 'Bạn đã nhận được tiền hoàn',
        body: `${recipient.amount.toString()}đ đã được hoàn vào Số dư COURTIN cho lịch đặt ${payload.bookingBusinessCode ?? ''}.`,
        priority: 'update', entityType: 'booking', entityId: payload.bookingId,
        actionKind: 'booking.view', actionExpiresAt: null,
      },
    });
  }
}

type SettledContribution = { id: string; userId: string; role: string; teamSide: string | null; createdAt: Date };

/**
 * BR-CM-15/20: chia `total` 50:50 giữa hai đội rồi chia đều trong đội bằng floor. Mọi phần lẻ VND
 * dồn cho chủ kèo (đội A), nên tổng luôn khớp tuyệt đối. Contribution cũ không có đội: chủ kèo là A,
 * người tham gia là B.
 */
export function allocateMatchCancellationRefund(contributions: SettledContribution[], total: bigint) {
  const organizer = contributions.find((item) => item.role === 'organizer');
  if (!organizer) throw new Error('MatchFunding thiếu organizer contribution');
  const side = (item: SettledContribution) => item.teamSide ?? (item.role === 'organizer' ? 'A' : 'B');
  const perTeam = total / 2n;
  const allocations = contributions.map((contribution) => {
    const team = contributions.filter((item) => side(item) === side(contribution));
    return { contribution, amount: perTeam / BigInt(team.length) };
  });
  const remainder = total - allocations.reduce((sum, item) => sum + item.amount, 0n);
  allocations.find((item) => item.contribution.id === organizer.id)!.amount += remainder;
  return allocations;
}

/** FIN-07/08 — đảo đúng phần doanh thu và hoa hồng mà G4 đã ghi. Mọi thay đổi
 * là bút toán mới; không sửa/xóa bút toán gốc (BR-FIN-01/14/15). */
export async function refundCancelledBooking(eventId: string, rawPayload: unknown): Promise<void> {
  const payload = bookingCancelledSchema.parse(rawPayload);
  const gross = BigInt(payload.gross);
  const effectivePercent = payload.reason === 'self' ? payload.refundPercent : 100;
  if (gross <= 0n || !Number.isInteger(effectivePercent) || effectivePercent < 0 || effectivePercent > 100) {
    throw new Error('Invalid BookingCancelled monetary payload');
  }
  const refundGross = (gross * BigInt(effectivePercent)) / 100n;
  const commissionReversal = (refundGross * COMMISSION_RATE_PERCENT) / 100n;
  const businessReversal = refundGross - commissionReversal;

  // Ánh xạ bookingId -> matchId là bất biến nên đọc được trước khi khóa. Mọi luồng chạm cùng kèo
  // khóa theo thứ tự matchId rồi bookingId (như settlePaidBookingFunding) để quyết định nguyên tử.
  const fundedMatch = await prisma.matchFunding.findUnique({ where: { bookingId: payload.bookingId }, select: { matchId: true } });
  await prisma.$transaction(async (tx) => {
    if (fundedMatch) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${fundedMatch.matchId}, 0))`;
    // Serialize every cancellation for the booking, including a redelivery that
    // accidentally arrives with a different event id.
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${payload.bookingId}))) AS booking_lock`;
    if (await tx.processedEvent.findUnique({ where: { eventId } })) return;

    const matchFunding = await tx.matchFunding.findUnique({
      where: { bookingId: payload.bookingId },
      include: { contributions: true },
    });
    // D39 emits BookingConfirmed and MatchBookingResolved from the same Venue
    // decision. A later D33 cancellation must wait for the resolution to turn
    // this funding into `settled`; otherwise the generic booking path would
    // refund the organizer rather than the actual contributors. Throwing keeps
    // the Rabbit delivery unprocessed and therefore safely retryable.
    if (matchFunding?.status === 'settling') {
      throw new Error('Match BookingCancelled awaits D39 settlement resolution');
    }
    // Nguồn hold bị hủy: booking đã được nhả, không còn tiền booking để hoàn. Nguồn booking đã thanh toán
    // chỉ đóng lớp kèo; booking trở lại booking thường nên đi tiếp luồng hoàn booking của chủ booking.
    if (matchFunding?.status === 'cancelled' && matchFunding.sourceType === 'hold') {
      await tx.processedEvent.create({ data: { eventId } });
      return;
    }
    if (matchFunding?.status === 'settled') {
      const [business, platform] = await Promise.all([
        tx.wallet.findFirst({ where: { userId: payload.businessUserId, walletType: 'business' } }),
        tx.wallet.findFirst({ where: { userId: null, walletType: 'platform' } }),
      ]);
      if (!business || !platform) throw new Error('Match BookingCancelled không khớp ví doanh thu');
      const [releaseEntries, commissionEntries, settlement] = await Promise.all([
        tx.ledgerEntry.findMany({
          where: { walletId: business.id, refType: 'booking', refId: payload.bookingId, type: 'release' },
        }),
        tx.ledgerEntry.findMany({
          where: { walletId: platform.id, refType: 'booking', refId: payload.bookingId, type: 'commission' },
        }),
        tx.ledgerEntry.findFirst({
          where: { walletId: platform.id, refType: 'booking', refId: payload.bookingId, type: 'settlement', amount: -gross },
        }),
      ]);
      const released = releaseEntries.reduce((sum, entry) => sum + entry.amount, 0n);
      const commissioned = commissionEntries.reduce((sum, entry) => sum + entry.amount, 0n);
      // Booking đã thanh toán trước khi thành kèo không có bút toán settlement từ platform.reserved.
      if (
        matchFunding.bookingPrice !== gross
        || releaseEntries.length !== 1
        || commissionEntries.length !== 1
        || released + commissioned !== gross
        || (matchFunding.sourceType === 'hold' && !settlement)
      ) throw new Error('Match BookingCancelled không khớp settlement/doanh thu gốc');
      if (business.pending < businessReversal || platform.available < commissionReversal) {
        throw new Error('Match BookingCancelled sẽ làm số dư tài chính âm');
      }

      // BR-CM-19/20: hoàn đủ tiền giữ chờ kết quả; phần booking hoàn theo chính sách. Tổng chia 50:50 giữa hai đội.
      const reserveRefund = matchFunding.resultReserveStatus === 'locked' ? matchFunding.resultReserve : 0n;
      if (refundGross + reserveRefund > 0n) {
        const settled = matchFunding.contributions.filter((item) => item.status === 'settled');
        const allocations = allocateMatchCancellationRefund(settled, refundGross + reserveRefund);
        if (reserveRefund > 0n) {
          await postLedgerEntry(tx, {
            walletId: platform.id, amount: -reserveRefund, type: 'refund',
            refType: 'matchResultReserve', refId: matchFunding.matchId, field: 'reserved',
          });
        }
        for (const allocation of allocations) {
          if (allocation.amount > 0n) {
            const personal = await getOrCreatePersonalWallet(tx, allocation.contribution.userId);
            await postLedgerEntry(tx, {
              walletId: personal.id,
              amount: allocation.amount,
              type: 'refund',
              refType: 'matchFeeCancellation',
              refId: allocation.contribution.id,
              withdrawableDelta: allocation.amount,
            });
          }
          await tx.matchContribution.update({
            where: { id: allocation.contribution.id },
            data: { status: 'refunded', refundedAt: new Date() },
          });
        }
        if (refundGross > 0n) {
          await postLedgerEntry(tx, {
            walletId: business.id,
            amount: -businessReversal,
            type: 'refund',
            refType: 'booking',
            refId: payload.bookingId,
            field: 'pending',
          });
          await postLedgerEntry(tx, {
            walletId: platform.id,
            amount: -commissionReversal,
            type: 'refund',
            refType: 'booking',
            refId: payload.bookingId,
          });
        }
        await tx.bookingRevenue.updateMany({
          where: { bookingId: payload.bookingId },
          data: { net: { decrement: businessReversal }, commission: { decrement: commissionReversal }, cancelledAt: new Date() },
        });
        await writeShutdownRefundCompletion(tx, payload, allocations.map((allocation) => ({
          userId: allocation.contribution.userId, amount: allocation.amount,
        })));
      } else {
        await tx.bookingRevenue.updateMany({ where: { bookingId: payload.bookingId }, data: { cancelledAt: new Date() } });
      }
      await tx.matchFunding.update({
        where: { matchId: matchFunding.matchId },
        data: {
          status: 'cancelled', cancelledAt: new Date(),
          ...(reserveRefund > 0n ? { resultReserveStatus: 'refunded' as const } : {}),
        },
      });
      await tx.processedEvent.create({ data: { eventId } });
      return;
    }

    if (refundGross > 0n) {
      const existingRefund = await tx.ledgerEntry.findFirst({
        where: { refType: 'booking', refId: payload.bookingId, type: 'refund' },
      });
      if (existingRefund) {
        await tx.processedEvent.create({ data: { eventId } });
        return;
      }

      const [personal, business, platform] = await Promise.all([
        // Thanh toán SePay không cần người chơi đã từng có số dư, nên có thể
        // chưa tồn tại ví personal. Tạo ví ngay trong transaction để khoản
        // hoàn không bị quarantine chỉ vì thiếu ví đích.
        getOrCreatePersonalWallet(tx, payload.userId),
        tx.wallet.findFirst({ where: { userId: payload.businessUserId, walletType: 'business' } }),
        tx.wallet.findFirst({ where: { userId: null, walletType: 'platform' } }),
      ]);
      if (!personal || !business || !platform) {
        throw new Error('BookingCancelled không khớp ví của giao dịch gốc');
      }

      const [releaseEntries, commissionEntries, balancePayment, sepayPayment] = await Promise.all([
        tx.ledgerEntry.findMany({
          where: { walletId: business.id, refType: 'booking', refId: payload.bookingId, type: 'release' },
        }),
        tx.ledgerEntry.findMany({
          where: { walletId: platform.id, refType: 'booking', refId: payload.bookingId, type: 'commission' },
        }),
        tx.ledgerEntry.findFirst({
          where: { walletId: personal.id, refType: 'booking', refId: payload.bookingId, type: 'payment', amount: -gross },
        }),
        tx.paymentIntent.findFirst({
          where: {
            userId: payload.userId,
            refType: 'booking',
            refId: payload.bookingId,
            amount: gross,
            status: 'completed',
          },
        }),
      ]);
      const released = releaseEntries.reduce((sum, entry) => sum + entry.amount, 0n);
      const commissioned = commissionEntries.reduce((sum, entry) => sum + entry.amount, 0n);
      if (
        releaseEntries.length !== 1 ||
        commissionEntries.length !== 1 ||
        released + commissioned !== gross ||
        (!balancePayment && !sepayPayment)
      ) {
        throw new Error('BookingCancelled không khớp thanh toán và doanh thu gốc');
      }
      if (business.pending < businessReversal || platform.available < commissionReversal) {
        throw new Error('BookingCancelled sẽ làm số dư tài chính âm');
      }
      await postLedgerEntry(tx, {
        walletId: personal.id,
        amount: refundGross,
        type: 'refund',
        refType: 'booking',
        refId: payload.bookingId,
        withdrawableDelta: refundGross,
      });
      await postLedgerEntry(tx, {
        walletId: business.id,
        amount: -businessReversal,
        type: 'refund',
        refType: 'booking',
        refId: payload.bookingId,
        field: 'pending',
      });
      await postLedgerEntry(tx, {
        walletId: platform.id,
        amount: -commissionReversal,
        type: 'refund',
        refType: 'booking',
        refId: payload.bookingId,
      });
      await tx.bookingRevenue.updateMany({
        where: { bookingId: payload.bookingId },
        data: { net: { decrement: businessReversal }, commission: { decrement: commissionReversal }, cancelledAt: new Date() },
      });
      await writeShutdownRefundCompletion(tx, payload, [{ userId: payload.userId, amount: refundGross }]);
    } else {
      // Refund 0% vẫn là booking đã hủy và tuyệt đối không được mở tranh chấp
      // sau giờ chơi để nhận thêm một khoản hoàn lần hai.
      await tx.bookingRevenue.updateMany({ where: { bookingId: payload.bookingId }, data: { cancelledAt: new Date() } });
    }
    await tx.processedEvent.create({ data: { eventId } });
  });
}

async function getOrCreatePersonalWallet(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
) {
  const existing = await tx.wallet.findFirst({ where: { userId, walletType: 'personal' } });
  return existing ?? tx.wallet.create({ data: { userId, walletType: 'personal' } });
}
