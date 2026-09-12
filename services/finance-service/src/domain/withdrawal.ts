import { randomUUID } from 'node:crypto';
import type { Prisma, WithdrawalRequest } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { postLedgerEntry } from './wallet.js';
import { writeOutbox } from '../lib/outbox.js';
import { writeFinanceUiInvalidation } from '../realtime/financeInvalidation.js';

export const MIN_WITHDRAWAL = 10000n;

export interface WithdrawalInput {
  amount: bigint;
  bankCode: string;
  bankAccountNumber: string;
  bankAccountName: string;
}

type WithdrawableWalletType = 'personal' | 'business';

export async function createWithdrawal(
  userId: string,
  input: WithdrawalInput,
  walletType: WithdrawableWalletType = 'business',
) {
  if (input.amount < MIN_WITHDRAWAL) {
    throw new AppError('MIN_WITHDRAWAL', `Số tiền rút tối thiểu là ${MIN_WITHDRAWAL}.`, 400);
  }
  if (![input.bankCode, input.bankAccountNumber, input.bankAccountName].every((value) => value.trim())) {
    throw new AppError('INVALID_BANK_ACCOUNT', 'Thông tin tài khoản nhận không hợp lệ.', 400);
  }
  const walletRef = await prisma.wallet.findFirst({ where: { userId, walletType } });
  if (!walletRef) {
    throw new AppError(
      walletType === 'personal' ? 'PERSONAL_WALLET_NOT_FOUND' : 'BUSINESS_WALLET_NOT_FOUND',
      walletType === 'personal' ? 'Không có ví cá nhân.' : 'Không có ví kinh doanh.',
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${walletRef.id} FOR UPDATE`;
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletRef.id } });
    const active = await tx.withdrawalRequest.findFirst({
      where: { sellerUserId: userId, walletType, status: { in: ['pending', 'partially_paid'] } },
    });
    if (active) throw new AppError('WITHDRAWAL_PENDING', 'Đã có yêu cầu rút đang xử lý.', 409);
    if (wallet.available < input.amount || (walletType === 'personal' && wallet.withdrawable < input.amount)) {
      throw new AppError('INSUFFICIENT_AVAILABLE', 'Số dư khả dụng không đủ.', 400);
    }
    const request = await tx.withdrawalRequest.create({
      data: {
        sellerUserId: userId,
        walletType,
        amount: input.amount,
        paidAmount: 0n,
        transferCode: `WD${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
        bankCode: input.bankCode.trim(),
        bankAccountNumber: input.bankAccountNumber.trim(),
        bankAccountName: input.bankAccountName.trim(),
      },
    });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        available: { decrement: input.amount },
        reserved: { increment: input.amount },
        ...(walletType === 'personal' ? { withdrawable: { decrement: input.amount } } : {}),
      },
    });
    const targetRole = walletType === 'personal' ? 'player' : 'provider';
    const requesterLabel = walletType === 'personal' ? 'Người chơi' : 'Chủ sân';
    await writeOutbox(tx, {
      aggregateType: 'Notification',
      aggregateId: `withdrawal.opened:${request.id}`,
      eventType: 'UserNotificationRequested',
      payload: {
        recipient: { type: 'role', targetRole: 'admin' },
        category: 'finance',
        kind: 'withdrawal.opened',
        title: 'Có yêu cầu rút tiền mới',
        body: `${requesterLabel} đang yêu cầu rút ${request.amount.toLocaleString('vi-VN')}đ.`,
        priority: 'action_required',
        entityType: 'withdrawal',
        entityId: request.id,
        actionKind: 'admin.withdrawal.review',
        actionExpiresAt: null,
      },
    });
    await writeOutbox(tx, {
      aggregateType: 'Notification',
      aggregateId: `withdrawal.submitted:${request.id}`,
      eventType: 'UserNotificationRequested',
      payload: {
        recipient: { type: 'user', userId, targetRole },
        category: 'finance',
        kind: 'withdrawal.submitted',
        title: 'Yêu cầu rút tiền đã được gửi',
        body: `${request.amount.toLocaleString('vi-VN')}đ đang chờ xử lý.`,
        priority: 'update',
        entityType: 'withdrawal',
        entityId: request.id,
        actionKind: 'withdrawal.view',
        actionExpiresAt: null,
      },
    });
    await writeFinanceUiInvalidation(tx, userId, ['wallet', 'withdrawals'], request.id);
    return request;
  });
}

export async function cancelWithdrawal(
  userId: string,
  requestId: string,
  walletType: WithdrawableWalletType = 'business',
) {
  return reversePendingWithdrawal(requestId, userId, null, 'cancelled', walletType);
}

export async function rejectWithdrawal(adminUserId: string, requestId: string, reason: string) {
  if (!reason.trim()) throw new AppError('REASON_REQUIRED', 'Lý do là bắt buộc.', 400);
  return reversePendingWithdrawal(requestId, null, { actorUserId: adminUserId, reason: reason.trim() }, 'rejected');
}

async function reversePendingWithdrawal(
  requestId: string,
  ownerUserId: string | null,
  audit: { actorUserId: string; reason: string } | null,
  action: 'cancelled' | 'rejected',
  expectedWalletType?: WithdrawableWalletType,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${requestId}))) AS request_lock`;
    const request = await tx.withdrawalRequest.findUnique({ where: { id: requestId } });
    if (!request || (ownerUserId && request.sellerUserId !== ownerUserId) || (expectedWalletType && request.walletType !== expectedWalletType)) {
      throw new AppError('WITHDRAWAL_NOT_FOUND', 'Không tìm thấy yêu cầu rút.', 404);
    }
    if (request.status !== 'pending') throw new AppError('WITHDRAWAL_NOT_PENDING', 'Yêu cầu không còn ở trạng thái chờ.', 409);
    if (await tx.ledgerEntry.findFirst({ where: { refType: 'withdrawal', refId: request.id, type: 'payout' } })) {
      throw new AppError('PAYOUT_ALREADY_RECORDED', 'Yêu cầu đã có khoản chi, không thể từ chối.', 409);
    }
    const wallet = await tx.wallet.findFirstOrThrow({ where: { userId: request.sellerUserId, walletType: request.walletType } });
    await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
    const freshWallet = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    if (freshWallet.reserved < request.amount) throw new Error('Reserved không đủ để hoàn tác yêu cầu rút');
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        reserved: { decrement: request.amount },
        available: { increment: request.amount },
        ...(request.walletType === 'personal' ? { withdrawable: { increment: request.amount } } : {}),
      },
    });
    const updated = await tx.withdrawalRequest.update({
      where: { id: request.id },
      data: {
        status: 'rejected',
        rejectionReason: audit?.reason ?? (action === 'cancelled' ? 'Chủ ví hủy yêu cầu.' : null),
        processedAt: new Date(),
      },
    });
    if (audit) {
      await tx.financeAudit.create({
        data: { actorUserId: audit.actorUserId, action: 'withdrawal_rejected', refType: 'withdrawal', refId: request.id, reason: audit.reason },
      });
    }
    if (action === 'rejected') {
      await writeOutbox(tx, {
        aggregateType: 'Notification',
        aggregateId: `withdrawal.rejected:${request.id}`,
        eventType: 'UserNotificationRequested',
        payload: {
          recipient: { type: 'user', userId: request.sellerUserId, targetRole: request.walletType === 'personal' ? 'player' : 'provider' },
          category: 'finance',
          kind: 'withdrawal.rejected',
          title: 'Yêu cầu rút tiền chưa được duyệt',
          body: 'Số tiền đã được trả lại vào số dư khả dụng của bạn.',
          priority: 'update',
          entityType: 'withdrawal',
          entityId: request.id,
          actionKind: 'withdrawal.view',
          actionExpiresAt: null,
        },
      });
    }
    await writeFinanceUiInvalidation(tx, request.sellerUserId, ['wallet', 'withdrawals'], request.id);
    return updated;
  });
}

export async function settleWithdrawalPayout(
  tx: Prisma.TransactionClient,
  request: WithdrawalRequest,
  amount: bigint,
  sepayEventId: string | null,
) {
  const paidBefore = request.paidAmount ?? 0n;
  const remaining = request.amount - paidBefore;
  if (amount <= 0n || amount > remaining) throw new Error('Số tiền payout vượt phần reserved của yêu cầu');
  const wallet = await tx.wallet.findFirstOrThrow({ where: { userId: request.sellerUserId, walletType: request.walletType } });
  await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
  const freshWallet = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  if (freshWallet.reserved < amount) throw new Error('Reserved không đủ cho payout');
  const payoutEntry = await postLedgerEntry(tx, {
    walletId: wallet.id,
    amount: -amount,
    type: 'payout',
    refType: 'withdrawal',
    refId: request.id,
    field: 'reserved',
  });
  const paidAmount = paidBefore + amount;
  const status = paidAmount === request.amount ? 'paid' : 'partially_paid';
  await tx.withdrawalRequest.update({
    where: { id: request.id },
    data: { status, paidAmount, sePayEventId: sepayEventId ?? request.sePayEventId, processedAt: status === 'paid' ? new Date() : null },
  });
  await writeFinanceUiInvalidation(tx, request.sellerUserId, ['wallet', 'withdrawals', 'ledger'], request.id);
  if (status === 'paid') {
    await writeOutbox(tx, {
      aggregateType: 'Notification',
      aggregateId: `withdrawal.paid:${request.id}`,
      eventType: 'UserNotificationRequested',
      payload: {
        recipient: { type: 'user', userId: request.sellerUserId, targetRole: request.walletType === 'personal' ? 'player' : 'provider' },
        category: 'finance',
        kind: 'withdrawal.paid',
        title: 'Yêu cầu rút tiền đã hoàn tất',
        body: `${paidAmount.toLocaleString('vi-VN')}đ đã được chi theo yêu cầu của bạn.`,
        priority: 'update',
        entityType: 'withdrawal',
        entityId: request.id,
        actionKind: 'withdrawal.view',
        actionExpiresAt: null,
      },
    });
    await writeOutbox(tx, {
      aggregateType: 'WithdrawalRequest', aggregateId: request.id, eventType: 'PayoutCompleted',
      payload: { withdrawalRequestId: request.id, sellerUserId: request.sellerUserId, amount: paidAmount.toString() },
    });
  }
  return { status, paidAmount, ledgerEntryId: payoutEntry.id };
}

/** Xác nhận khoản chi đã được Admin chuyển từ tài khoản không nhận webhook SePay.
 * Lý do bắt buộc phải chứa tham chiếu ngân hàng để audit vẫn truy được nguồn chi. */
export async function confirmManualWithdrawalPayout(adminUserId: string, requestId: string, reason: string) {
  const cleanReason = reason.trim();
  if (!cleanReason) throw new AppError('REASON_REQUIRED', 'Mã tham chiếu hoặc lý do chi là bắt buộc.', 400);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${requestId}))) AS request_lock`;
    const request = await tx.withdrawalRequest.findUnique({ where: { id: requestId } });
    if (!request || !['pending', 'partially_paid'].includes(request.status)) {
      throw new AppError('WITHDRAWAL_NOT_PAYABLE', 'Yêu cầu rút không thể ghi nhận chi thủ công.', 409);
    }
    const remaining = request.amount - (request.paidAmount ?? 0n);
    const payout = await settleWithdrawalPayout(tx, request, remaining, null);
    await tx.financeAudit.create({
      data: {
        actorUserId: adminUserId,
        action: 'withdrawal_paid_manually',
        refType: 'withdrawal',
        refId: request.id,
        reason: cleanReason,
        metadata: { amount: remaining.toString(), transferCode: request.transferCode },
      },
    });
    return payout;
  });
}
