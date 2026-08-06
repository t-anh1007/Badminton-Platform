import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { seedBusinessBalance } from './helpers.js';
import { cancelWithdrawal, createWithdrawal, rejectWithdrawal } from '../src/domain/withdrawal.js';
import { handleOutgoingTransfer } from '../src/domain/outgoingTransfer.js';

const bank = { bankCode: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'NGUYEN VAN A' };

afterAll(async () => prisma.$disconnect());

describe('FIN-10 — yêu cầu rút số dư khả dụng', () => {
  it('AC-FIN-10-1: available -> reserved trong cùng transaction, tổng không đổi và không tạo ledger', async () => {
    const userId = randomUUID();
    const wallet = await seedBusinessBalance(userId, 1_000_000n);
    const before = await prisma.ledgerEntry.count({ where: { walletId: wallet.id } });
    const request = await createWithdrawal(userId, { amount: 600000n, ...bank });
    const after = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    expect([request.status, after.available, after.reserved, after.available + after.reserved]).toEqual(['pending', 400000n, 600000n, 1_000_000n]);
    expect(await prisma.ledgerEntry.count({ where: { walletId: wallet.id } })).toBe(before);
  });

  it('AC-FIN-10-2/3/5: từ chối vượt available, pending thứ hai và user không có business wallet', async () => {
    const userId = randomUUID();
    const wallet = await seedBusinessBalance(userId, 400000n);
    await expect(createWithdrawal(userId, { amount: 600000n, ...bank })).rejects.toMatchObject({ code: 'INSUFFICIENT_AVAILABLE' });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).available).toBe(400000n);
    await createWithdrawal(userId, { amount: 200000n, ...bank });
    await expect(createWithdrawal(userId, { amount: 100000n, ...bank })).rejects.toMatchObject({ code: 'WITHDRAWAL_PENDING' });
    await expect(createWithdrawal(randomUUID(), { amount: 100000n, ...bank })).rejects.toMatchObject({ code: 'BUSINESS_WALLET_NOT_FOUND' });
  });

  it('từ chối dưới ngưỡng rút tối thiểu 100.000đ', async () => {
    const userId = randomUUID();
    await seedBusinessBalance(userId, 1_000_000n);
    await expect(createWithdrawal(userId, { amount: 99999n, ...bank })).rejects.toMatchObject({ code: 'MIN_WITHDRAWAL' });
  });

  it('AC-FIN-10-4: chủ ví hủy pending trả reserved về available, không tạo ledger', async () => {
    const userId = randomUUID();
    const wallet = await seedBusinessBalance(userId, 1_000_000n);
    const request = await createWithdrawal(userId, { amount: 600000n, ...bank });
    const before = await prisma.ledgerEntry.count({ where: { walletId: wallet.id } });
    await cancelWithdrawal(userId, request.id);
    const after = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    expect([after.available, after.reserved]).toEqual([1_000_000n, 0n]);
    expect(await prisma.ledgerEntry.count({ where: { walletId: wallet.id } })).toBe(before);
  });

  it('AC-FIN-10-6: hai yêu cầu 600k đồng thời chỉ một thành công và không chiếm chồng', async () => {
    const userId = randomUUID();
    const wallet = await seedBusinessBalance(userId, 1_000_000n);
    const results = await Promise.allSettled([
      createWithdrawal(userId, { amount: 600000n, ...bank }),
      createWithdrawal(userId, { amount: 600000n, ...bank }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const after = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    expect([after.available, after.reserved, after.available + after.reserved]).toEqual([400000n, 600000n, 1_000_000n]);
  });
});

describe('FIN-11 — xử lý yêu cầu rút', () => {
  it('AC-FIN-11-1/6: webhook out khớp đủ chỉ trừ reserved một lần, ghi payout và outbox', async () => {
    const userId = randomUUID();
    const wallet = await seedBusinessBalance(userId, 1_000_000n);
    const request = await createWithdrawal(userId, { amount: 600000n, ...bank });
    await handleOutgoingTransfer({ externalRef: randomUUID(), amount: 600000n, rawRef: request.transferCode });
    const after = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    const payouts = await prisma.ledgerEntry.findMany({ where: { refId: request.id, type: 'payout' } });
    expect([after.available, after.reserved, payouts.length, payouts[0]?.amount]).toEqual([400000n, 0n, 1, -600000n]);
    expect(after.available + after.reserved + -payouts[0]!.amount).toBe(1_000_000n);
    expect((await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('paid');
    expect(await prisma.outbox.count({ where: { aggregateId: request.id, eventType: 'PayoutCompleted' } })).toBe(1);
  });

  it('AC-FIN-11-2: webhook trùng externalRef không tạo payout thứ hai', async () => {
    const userId = randomUUID();
    await seedBusinessBalance(userId, 1_000_000n);
    const request = await createWithdrawal(userId, { amount: 600000n, ...bank });
    const transfer = { externalRef: randomUUID(), amount: 600000n, rawRef: request.transferCode };
    await handleOutgoingTransfer(transfer);
    await handleOutgoingTransfer(transfer);
    expect(await prisma.ledgerEntry.count({ where: { refId: request.id, type: 'payout' } })).toBe(1);
  });

  it('AC-FIN-11-3: sai số tiền giữ pending/reserved và vào hàng chờ unmatched', async () => {
    const userId = randomUUID();
    const wallet = await seedBusinessBalance(userId, 1_000_000n);
    const request = await createWithdrawal(userId, { amount: 600000n, ...bank });
    const externalRef = randomUUID();
    await handleOutgoingTransfer({ externalRef, amount: 500000n, rawRef: request.transferCode });
    expect((await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('pending');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).reserved).toBe(600000n);
    expect((await prisma.sepayEvent.findUniqueOrThrow({ where: { externalRef } })).status).toBe('unmatched');
  });

  it('AC-FIN-11-4/5: Admin từ chối cần lý do, trả phân vùng và ghi audit không ledger', async () => {
    const userId = randomUUID();
    const adminId = randomUUID();
    const wallet = await seedBusinessBalance(userId, 1_000_000n);
    const request = await createWithdrawal(userId, { amount: 600000n, ...bank });
    await expect(rejectWithdrawal(adminId, request.id, ' ')).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    await rejectWithdrawal(adminId, request.id, 'Thông tin tài khoản không hợp lệ');
    const after = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    expect([after.available, after.reserved]).toEqual([1_000_000n, 0n]);
    expect(await prisma.ledgerEntry.count({ where: { refId: request.id } })).toBe(0);
    expect(await prisma.financeAudit.count({ where: { refId: request.id, action: 'withdrawal_rejected' } })).toBe(1);
  });
});
