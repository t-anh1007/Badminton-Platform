import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { postLedgerEntry } from './wallet.js';
import { settleWithdrawalPayout } from './withdrawal.js';
import { writeOutbox } from '../lib/outbox.js';

function requireReason(reason: string) {
  if (!reason.trim()) throw new AppError('REASON_REQUIRED', 'Lý do là bắt buộc.', 400);
  return reason.trim();
}

export function listUnmatchedEvents() {
  return prisma.sepayEvent.findMany({ where: { status: 'unmatched' }, orderBy: { receivedAt: 'asc' } });
}

export async function assignIncomingEvent(adminUserId: string, eventId: string, userId: string, reason: string) {
  const cleanReason = requireReason(reason);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${eventId}))) AS event_lock`;
    const event = await tx.sepayEvent.findUnique({ where: { id: eventId } });
    if (!event || event.status !== 'unmatched') throw new AppError('EVENT_NOT_UNMATCHED', 'Sự kiện không còn chờ đối soát.', 409);
    if (event.direction !== 'in') throw new AppError('WRONG_DIRECTION', 'Chỉ có thể gán tiền vào cho người dùng.', 400);
    const wallet = await tx.wallet.findFirst({ where: { userId, walletType: 'personal' } });
    if (!wallet) throw new AppError('USER_WALLET_NOT_FOUND', 'Không tìm thấy ví cá nhân của người dùng.', 404);
    const topupEntry = await postLedgerEntry(tx, { walletId: wallet.id, amount: event.amount, type: 'topup', refType: 'reconciliation', refId: event.id });
    await tx.sepayAllocation.create({ data: { sepayEventId: event.id, kind: 'topup', amount: event.amount, refId: topupEntry.id, reason: cleanReason } });
    await tx.sepayEvent.update({ where: { id: event.id }, data: { status: 'matched_manual', matchedType: 'Wallet', matchedId: wallet.id } });
    await tx.financeAudit.create({
      data: { actorUserId: adminUserId, action: 'reconcile_incoming', refType: 'sepay_event', refId: event.id, reason: cleanReason, metadata: { userId } },
    });
  });
}

export async function assignOutgoingEvent(adminUserId: string, eventId: string, requestId: string, reason: string) {
  const cleanReason = requireReason(reason);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${eventId}))) AS event_lock`;
    const event = await tx.sepayEvent.findUnique({ where: { id: eventId } });
    if (!event || event.status !== 'unmatched') throw new AppError('EVENT_NOT_UNMATCHED', 'Sự kiện không còn chờ đối soát.', 409);
    if (event.direction !== 'out') throw new AppError('WRONG_DIRECTION', 'Chỉ có thể gán tiền ra cho yêu cầu rút.', 400);
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${requestId}))) AS request_lock`;
    const request = await tx.withdrawalRequest.findUnique({ where: { id: requestId } });
    if (!request || !['pending', 'partially_paid'].includes(request.status)) {
      throw new AppError('WITHDRAWAL_NOT_PAYABLE', 'Yêu cầu rút không thể nhận khoản chi này.', 409);
    }
    const remaining = request.amount - (request.paidAmount ?? 0n);
    const payoutAmount = event.amount < remaining ? event.amount : remaining;
    const payout = await settleWithdrawalPayout(tx, request, payoutAmount, event.id);
    await tx.sepayAllocation.create({
      data: { sepayEventId: event.id, kind: 'payout', amount: payoutAmount, refId: payout.ledgerEntryId, reason: cleanReason },
    });
    if (event.amount > payoutAmount) {
      await tx.sepayAllocation.create({
        data: { sepayEventId: event.id, kind: 'out_of_scope', amount: event.amount - payoutAmount, reason: cleanReason },
      });
    }
    await tx.sepayEvent.update({
      where: { id: event.id },
      data: { status: 'matched_manual', matchedType: 'WithdrawalRequest', matchedId: request.id },
    });
    await tx.financeAudit.create({
      data: {
        actorUserId: adminUserId, action: 'reconcile_outgoing', refType: 'sepay_event', refId: event.id,
        reason: cleanReason, metadata: { requestId, payoutAmount: payoutAmount.toString(), excess: (event.amount - payoutAmount).toString() },
      },
    });
  });
}

export async function markEventOutOfScope(adminUserId: string, eventId: string, reason: string) {
  const cleanReason = requireReason(reason);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${eventId}))) AS event_lock`;
    const event = await tx.sepayEvent.findUnique({ where: { id: eventId } });
    if (!event || event.status !== 'unmatched') throw new AppError('EVENT_NOT_UNMATCHED', 'Sự kiện không còn chờ đối soát.', 409);
    await tx.sepayAllocation.create({ data: { sepayEventId: event.id, kind: 'out_of_scope', amount: event.amount, reason: cleanReason } });
    await tx.sepayEvent.update({ where: { id: event.id }, data: { status: 'out_of_scope' } });
    await tx.financeAudit.create({
      data: { actorUserId: adminUserId, action: 'reconcile_out_of_scope', refType: 'sepay_event', refId: event.id, reason: cleanReason },
    });
  });
}

export async function finalizePartialWithdrawal(adminUserId: string, requestId: string, reason: string) {
  const cleanReason = requireReason(reason);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${requestId}))) AS request_lock`;
    const request = await tx.withdrawalRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== 'partially_paid' || !request.paidAmount || request.paidAmount <= 0n) {
      throw new AppError('WITHDRAWAL_NOT_PARTIAL', 'Yêu cầu không ở trạng thái đã chi một phần.', 409);
    }
    const remainder = request.amount - request.paidAmount;
    const wallet = await tx.wallet.findFirstOrThrow({ where: { userId: request.sellerUserId, walletType: 'business' } });
    await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
    await tx.wallet.update({ where: { id: wallet.id }, data: { reserved: { decrement: remainder }, available: { increment: remainder } } });
    await tx.withdrawalRequest.update({ where: { id: request.id }, data: { status: 'paid', processedAt: new Date() } });
    await writeOutbox(tx, {
      aggregateType: 'WithdrawalRequest', aggregateId: request.id, eventType: 'PayoutCompleted',
      payload: { withdrawalRequestId: request.id, sellerUserId: request.sellerUserId, amount: request.paidAmount.toString() },
    });
    await tx.financeAudit.create({
      data: { actorUserId: adminUserId, action: 'withdrawal_finalized_partial', refType: 'withdrawal', refId: request.id, reason: cleanReason },
    });
  });
}
