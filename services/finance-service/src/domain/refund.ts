import { prisma } from '../lib/prisma.js';
import { COMMISSION_RATE_PERCENT } from '../lib/constants.js';
import { postLedgerEntry } from './wallet.js';
import { z } from 'zod';

export interface BookingCancelledPayload {
  bookingId: string;
  userId: string;
  businessUserId: string;
  gross: string;
  refundPercent: number;
  reason: 'self' | 'provider_fault' | 'platform_admin';
  cancellationNote?: string;
}

const bookingCancelledSchema = z.object({
  bookingId: z.string().uuid(),
  userId: z.string().uuid(),
  businessUserId: z.string().uuid(),
  gross: z.string().regex(/^[1-9]\d*$/),
  refundPercent: z.number().int().min(0).max(100),
  reason: z.enum(['self', 'provider_fault', 'platform_admin']),
  cancellationNote: z.string().optional(),
});

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

  await prisma.$transaction(async (tx) => {
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
      if (
        matchFunding.bookingPrice !== gross
        || releaseEntries.length !== 1
        || commissionEntries.length !== 1
        || released + commissioned !== gross
        || !settlement
      ) throw new Error('Match BookingCancelled không khớp settlement/doanh thu gốc');
      if (business.pending < businessReversal || platform.available < commissionReversal) {
        throw new Error('Match BookingCancelled sẽ làm số dư tài chính âm');
      }

      if (refundGross > 0n) {
        const participants = matchFunding.contributions.filter((item) => item.role === 'participant' && item.status === 'settled');
        const organizer = matchFunding.contributions.find((item) => item.role === 'organizer' && item.status === 'settled');
        if (!organizer) throw new Error('MatchFunding thiếu organizer contribution');
        const participantRefunds = participants.map((item) => ({
          contribution: item,
          amount: (item.amount * BigInt(effectivePercent)) / 100n,
        }));
        const participantTotal = participantRefunds.reduce((sum, item) => sum + item.amount, 0n);
        const organizerRefund = refundGross - participantTotal;
        if (organizerRefund < 0n) throw new Error('D37 refund allocation is negative');
        for (const allocation of [
          ...participantRefunds,
          { contribution: organizer, amount: organizerRefund },
        ]) {
          if (allocation.amount > 0n) {
            const personal = await getOrCreatePersonalWallet(tx, allocation.contribution.userId);
            await postLedgerEntry(tx, {
              walletId: personal.id,
              amount: allocation.amount,
              type: 'refund',
              refType: 'matchFeeCancellation',
              refId: allocation.contribution.id,
            });
          }
          await tx.matchContribution.update({
            where: { id: allocation.contribution.id },
            data: { status: 'refunded', refundedAt: new Date() },
          });
        }
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
      } else {
        await tx.bookingRevenue.updateMany({ where: { bookingId: payload.bookingId }, data: { cancelledAt: new Date() } });
      }
      await tx.matchFunding.update({
        where: { matchId: matchFunding.matchId }, data: { status: 'cancelled', cancelledAt: new Date() },
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
        tx.wallet.findFirst({ where: { userId: payload.userId, walletType: 'personal' } }),
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
