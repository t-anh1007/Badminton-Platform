import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { COMMISSION_RATE_PERCENT } from '../lib/constants.js';
import { getOrCreateWallet, postLedgerEntry } from './wallet.js';
import { writeFinanceUiInvalidation } from '../realtime/financeInvalidation.js';

const createSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().min(1),
  contactPhone: z.string().trim()
    .transform((value) => value.replace(/[\s.-]/g, '').replace(/^\+84/, '0'))
    .refine((value) => /^0\d{9}$/.test(value), 'Số điện thoại liên hệ không hợp lệ.'),
  evidence: z.array(z.string().trim().min(1)).max(5).default([]),
});

const resolutionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('full_refund'), reason: z.string().trim().min(1) }),
  z.object({ decision: z.literal('partial_refund'), amount: z.bigint().positive(), reason: z.string().trim().min(1) }),
  z.object({ decision: z.literal('rejected'), reason: z.string().trim().min(1) }),
]);

export type CreateDisputeInput = z.input<typeof createSchema>;
export type ResolveDisputeInput = z.input<typeof resolutionSchema>;

export async function listEligibleDisputeBookings(userId: string, now = new Date()) {
  const paidBookingIds = (await prisma.paymentIntent.findMany({
    where: { userId, refType: 'booking', status: 'completed' }, select: { refId: true },
  })).map((row) => row.refId);
  return prisma.bookingRevenue.findMany({
    where: {
      bookingId: { in: paidBookingIds }, endAt: { lte: now }, releaseAt: { gte: now }, releasedAt: null, cancelledAt: null,
      NOT: { bookingId: { in: (await prisma.dispute.findMany({ select: { bookingId: true } })).map((row) => row.bookingId) } },
    },
    orderBy: { endAt: 'desc' },
  });
}

export async function listMyDisputes(userId: string) {
  return prisma.dispute.findMany({ where: { raiserUserId: userId }, orderBy: { createdAt: 'desc' } });
}

export async function listAdminDisputes() {
  const disputes = await prisma.dispute.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] });
  const bookingIds = disputes.map((row) => row.bookingId);
  const disputeIds = disputes.map((row) => row.id);
  const [revenues, ledgerEntries] = await Promise.all([
    prisma.bookingRevenue.findMany({ where: { bookingId: { in: bookingIds } } }),
    prisma.ledgerEntry.findMany({
      where: { OR: [
        { refType: 'booking', refId: { in: bookingIds } },
        { refType: 'dispute', refId: { in: disputeIds } },
      ] },
      include: { wallet: { select: { walletType: true, userId: true } } },
      orderBy: { ts: 'asc' },
    }),
  ]);
  const revenueByBooking = new Map(revenues.map((row) => [row.bookingId, row]));
  return disputes.map((row) => ({
    ...row,
    revenue: revenueByBooking.get(row.bookingId) ?? null,
    ledgerEntries: ledgerEntries.filter((entry) =>
      (entry.refType === 'booking' && entry.refId === row.bookingId)
      || (entry.refType === 'dispute' && entry.refId === row.id)),
  }));
}

/** FIN-12/D11: cùng advisory lock booking với scheduler G6, nên tại mốc 24h
 * chỉ dispute hoặc release thắng; không thể cùng xảy ra. */
export async function createDispute(userId: string, rawInput: CreateDisputeInput, now = new Date()) {
  const input = createSchema.parse(rawInput);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${input.bookingId}))) AS booking_lock`;
    const revenue = await tx.bookingRevenue.findUnique({ where: { bookingId: input.bookingId } });
    if (!revenue) throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy giao dịch booking.', 404);
    const payment = await tx.paymentIntent.findFirst({
      where: { userId, refType: 'booking', refId: input.bookingId, status: 'completed' },
    });
    if (!payment) throw new AppError('FORBIDDEN', 'Không có quyền tranh chấp booking này.', 403);
    if (revenue.cancelledAt) throw new AppError('BOOKING_CANCELLED', 'Booking đã hủy nên không thể mở tranh chấp.', 409);
    if (now < revenue.endAt) throw new AppError('BOOKING_NOT_ENDED', 'Ca chơi chưa kết thúc; hãy dùng luồng hủy booking.', 409);
    if (now > revenue.releaseAt || revenue.releasedAt) throw new AppError('DISPUTE_EXPIRED', 'Đã hết hạn khiếu nại 24 giờ.', 409);
    if (await tx.dispute.findUnique({ where: { bookingId: input.bookingId } })) {
      throw new AppError('DISPUTE_EXISTS', 'Booking đã có tranh chấp.', 409);
    }
    const dispute = await tx.dispute.create({
      data: {
        refType: 'booking', refId: input.bookingId, bookingId: input.bookingId,
        raiserUserId: userId, reason: input.reason, contactPhone: input.contactPhone, evidence: input.evidence,
        deadlineAt: revenue.releaseAt,
      },
    });
    await tx.outbox.create({
      data: {
        aggregateType: 'Notification', aggregateId: `dispute.opened:${dispute.id}`, eventType: 'UserNotificationRequested',
        payload: { recipient: { type: 'role', targetRole: 'admin' }, category: 'dispute', kind: 'dispute.opened', title: 'Có tranh chấp mới cần xử lý', body: 'Người chơi đã gửi yêu cầu hỗ trợ cho một booking.', priority: 'action_required', entityType: 'dispute', entityId: dispute.id, actionKind: 'admin.dispute.review', actionExpiresAt: null },
      },
    });
    await writeFinanceUiInvalidation(tx, revenue.businessUserId, ['revenue'], dispute.id);
    return dispute;
  });
}

/** FIN-13/BR-FIN-14: quyết định tiền là append-only và đảo đồng thời ba vế.
 * Phần doanh thu ròng còn lại được gỡ hold sang available trong cùng transaction. */
export async function resolveDispute(adminUserId: string, disputeId: string, rawInput: ResolveDisputeInput, now = new Date()) {
  const input = resolutionSchema.parse(rawInput);
  const current = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!current) throw new AppError('DISPUTE_NOT_FOUND', 'Không tìm thấy tranh chấp.', 404);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${current.bookingId}))) AS booking_lock`;
    await tx.$queryRaw`SELECT id FROM disputes WHERE id = ${disputeId} FOR UPDATE`;
    const dispute = await tx.dispute.findUniqueOrThrow({ where: { id: disputeId } });
    if (dispute.status !== 'open') throw new AppError('DISPUTE_RESOLVED', 'Tranh chấp đã được giải quyết.', 409);
    const revenue = await tx.bookingRevenue.findUniqueOrThrow({ where: { bookingId: dispute.bookingId } });
    if (revenue.releasedAt) throw new AppError('REVENUE_RELEASED', 'Doanh thu đã được giải phóng.', 409);

    const remainingGross = revenue.net + revenue.commission;
    const refundGross = input.decision === 'rejected' ? 0n
      : input.decision === 'full_refund' ? remainingGross : input.amount;
    if (refundGross > remainingGross) throw new AppError('INVALID_REFUND', 'Số tiền hoàn vượt giá trị còn lại của booking.', 409);
    const commissionReversal = (refundGross * COMMISSION_RATE_PERCENT) / 100n;
    const businessReversal = refundGross - commissionReversal;
    if (businessReversal > revenue.net || commissionReversal > revenue.commission) {
      throw new AppError('INVALID_REFUND', 'Số tiền hoàn không khớp phân bổ booking.', 409);
    }

    const business = await tx.wallet.findUniqueOrThrow({ where: { id: revenue.businessWalletId } });
    const platform = await tx.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } });
    const personal = await getOrCreateWallet(tx, dispute.raiserUserId, 'personal');

    if (refundGross > 0n) {
      // Giữ cùng thứ tự khóa personal → business → platform với các luồng hoàn
      // G5 để không tạo vòng chờ khi hai booking dùng chung ví provider.
      await postLedgerEntry(tx, { walletId: personal.id, amount: refundGross, type: 'refund', refType: 'dispute', refId: dispute.id, withdrawableDelta: refundGross });
      await postLedgerEntry(tx, { walletId: business.id, amount: -businessReversal, type: 'refund', refType: 'dispute', refId: dispute.id, field: 'pending' });
      await postLedgerEntry(tx, { walletId: platform.id, amount: -commissionReversal, type: 'refund', refType: 'dispute', refId: dispute.id });
    } else {
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${business.id} FOR UPDATE`;
    }

    const remainingNet = revenue.net - businessReversal;
    if (remainingNet > 0n) {
      const lockedBusiness = await tx.wallet.findUniqueOrThrow({ where: { id: business.id } });
      if (lockedBusiness.pending < remainingNet) {
        throw new AppError('NEGATIVE_BALANCE', 'Không đủ doanh thu pending để giải quyết tranh chấp.', 409);
      }
      await tx.wallet.update({
        where: { id: business.id },
        data: { pending: { decrement: remainingNet }, available: { increment: remainingNet } },
      });
    }
    await tx.bookingRevenue.update({
      where: { bookingId: revenue.bookingId },
      data: {
        net: remainingNet, commission: revenue.commission - commissionReversal,
        releasedAt: now,
      },
    });
    const resolved = await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: 'resolved', resolution: input.decision, resolutionAmount: refundGross,
        decidedByUserId: adminUserId, resolvedAt: now,
      },
    });
    await tx.financeAudit.create({
      data: {
        actorUserId: adminUserId, action: 'dispute_resolved', refType: 'dispute', refId: dispute.id,
        reason: input.reason, metadata: { decision: input.decision, refundAmount: refundGross.toString() },
      },
    });
    await tx.outbox.create({
      data: {
        aggregateType: 'Dispute', aggregateId: dispute.id, eventType: 'DisputeResolved',
        payload: {
          disputeId: dispute.id, bookingId: dispute.bookingId, playerUserId: dispute.raiserUserId,
          businessUserId: revenue.businessUserId, decision: input.decision, refundAmount: refundGross.toString(),
        },
      },
    });
    for (const recipient of [
      { userId: dispute.raiserUserId, targetRole: 'player' as const },
      { userId: revenue.businessUserId, targetRole: 'provider' as const },
    ]) {
      await tx.outbox.create({
        data: {
          aggregateType: 'Notification', aggregateId: `dispute.resolved:${dispute.id}:${recipient.targetRole}`, eventType: 'UserNotificationRequested',
          payload: { recipient: { type: 'user', userId: recipient.userId, targetRole: recipient.targetRole }, category: 'dispute', kind: 'dispute.resolved', title: 'Tranh chấp đã có kết quả', body: 'Bạn có thể xem quyết định và cập nhật liên quan.', priority: 'update', entityType: 'dispute', entityId: dispute.id, actionKind: 'dispute.view', actionExpiresAt: null },
        },
      });
    }
    await writeFinanceUiInvalidation(tx, revenue.businessUserId, ['wallet', 'revenue', 'ledger'], dispute.id);
    return resolved;
  });
}
