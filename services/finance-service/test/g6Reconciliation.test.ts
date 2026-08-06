import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { getOrCreateWallet } from '../src/domain/wallet.js';
import { handleIncomingTransfer } from '../src/domain/sepayWebhook.js';
import { handleOutgoingTransfer } from '../src/domain/outgoingTransfer.js';
import { createWithdrawal, rejectWithdrawal } from '../src/domain/withdrawal.js';
import { createTopupIntent } from '../src/domain/topup.js';
import { payBookingWithBalance } from '../src/domain/payment.js';
import { recordBookingRevenue } from '../src/domain/revenue.js';
import { refundCancelledBooking } from '../src/domain/refund.js';
import { createDispute, resolveDispute } from '../src/domain/dispute.js';
import { seedBusinessBalance } from './helpers.js';
import {
  assignIncomingEvent, assignOutgoingEvent, finalizePartialWithdrawal,
  listUnmatchedEvents, markEventOutOfScope,
} from '../src/domain/reconciliation.js';

const adminId = randomUUID();
const bank = { bankCode: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'NGUYEN VAN A' };

async function personalWallet(userId: string) {
  return prisma.$transaction((tx) => getOrCreateWallet(tx, userId, 'personal'));
}

async function unmatchedOut(amount: bigint, rawRef: string) {
  const externalRef = randomUUID();
  await handleOutgoingTransfer({ externalRef, amount, rawRef });
  return prisma.sepayEvent.findUniqueOrThrow({ where: { externalRef } });
}

afterAll(async () => prisma.$disconnect());

describe('FIN-14 — đối soát giao dịch chưa khớp', () => {
  it('AC-FIN-14-1/2: tiền vào lạc nằm unmatched, Admin gán đúng ví personal và có audit', async () => {
    const userId = randomUUID();
    const wallet = await personalWallet(userId);
    const externalRef = randomUUID();
    await handleIncomingTransfer({ externalRef, amount: 200000n, rawRef: `UNKNOWN-${randomUUID()}` });
    const event = await prisma.sepayEvent.findUniqueOrThrow({ where: { externalRef } });
    expect(event.status).toBe('unmatched');
    expect((await listUnmatchedEvents()).some((row) => row.id === event.id)).toBe(true);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).available).toBe(0n);

    await assignIncomingEvent(adminId, event.id, userId, 'Xác minh sao kê');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).available).toBe(200000n);
    expect((await prisma.sepayEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('matched_manual');
    expect(await prisma.financeAudit.count({ where: { refId: event.id, action: 'reconcile_incoming' } })).toBe(1);
  });

  it('AC-FIN-14-3: Admin gán tiền ra khớp đủ -> paid, reserved 0, payout', async () => {
    const userId = randomUUID();
    const wallet = await seedBusinessBalance(userId, 600000n);
    const request = await createWithdrawal(userId, { amount: 600000n, ...bank });
    const event = await unmatchedOut(600000n, 'NO-AUTO-MATCH');
    await assignOutgoingEvent(adminId, event.id, request.id, 'Khớp chứng từ ngân hàng');
    expect((await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('paid');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).reserved).toBe(0n);
    expect(await prisma.ledgerEntry.count({ where: { refId: request.id, type: 'payout' } })).toBe(1);
  });

  it('AC-FIN-14-4/9/10: chi thiếu giữ phần dư reserved, chốt trả dư; không thể reject khoản đã payout', async () => {
    const userId = randomUUID();
    const wallet = await seedBusinessBalance(userId, 600000n);
    const request = await createWithdrawal(userId, { amount: 600000n, ...bank });
    const event = await unmatchedOut(500000n, request.transferCode);
    await assignOutgoingEvent(adminId, event.id, request.id, 'Ngân hàng chi thiếu');
    const partial = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect([partial.status, partial.paidAmount, (await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).reserved]).toEqual(['partially_paid', 500000n, 100000n]);
    await expect(rejectWithdrawal(adminId, request.id, 'Từ chối sai')).rejects.toBeDefined();

    await finalizePartialWithdrawal(adminId, request.id, 'Chốt số đã thực chi');
    const finalWallet = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    expect([finalWallet.available, finalWallet.reserved]).toEqual([100000n, 0n]);
    expect(await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({ status: 'paid', paidAmount: 500000n });
    expect(await prisma.ledgerEntry.count({ where: { refId: request.id, type: 'payout' } })).toBe(1);
  });

  it('AC-FIN-14-5/6: sự kiện đã xử lý không dùng lại và mọi cách xử lý cần lý do', async () => {
    const event = await unmatchedOut(100000n, 'OUTSIDE');
    await expect(markEventOutOfScope(adminId, event.id, ' ')).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    await markEventOutOfScope(adminId, event.id, 'Không thuộc nền tảng');
    await expect(markEventOutOfScope(adminId, event.id, 'Lần hai')).rejects.toMatchObject({ code: 'EVENT_NOT_UNMATCHED' });
  });

  it('AC-FIN-14-7: mỗi event đã xử lý có tổng allocation đúng bằng amount và cùng hướng nghiệp vụ', async () => {
    const userId = randomUUID();
    await personalWallet(userId);
    const externalRef = randomUUID();
    await handleIncomingTransfer({ externalRef, amount: 210000n, rawRef: `UNKNOWN-${randomUUID()}` });
    const event = await prisma.sepayEvent.findUniqueOrThrow({ where: { externalRef } });
    await assignIncomingEvent(adminId, event.id, userId, 'Gán tiền vào');
    const allocations = await prisma.sepayAllocation.findMany({ where: { sepayEventId: event.id } });
    expect(allocations.reduce((sum, row) => sum + row.amount, 0n)).toBe(event.amount);
    expect(allocations.every((row) => row.kind === 'topup')).toBe(true);
  });

  it('AC-FIN-14-11: chi vượt tách payout đúng yêu cầu + out_of_scope phần vượt', async () => {
    const userId = randomUUID();
    const wallet = await seedBusinessBalance(userId, 600000n);
    const request = await createWithdrawal(userId, { amount: 600000n, ...bank });
    const event = await unmatchedOut(700000n, request.transferCode);
    await assignOutgoingEvent(adminId, event.id, request.id, 'Ngân hàng chi vượt');
    const allocations = await prisma.sepayAllocation.findMany({ where: { sepayEventId: event.id }, orderBy: { amount: 'desc' } });
    expect(allocations.map((row) => [row.kind, row.amount])).toEqual([['payout', 600000n], ['out_of_scope', 100000n]]);
    expect(allocations.reduce((sum, row) => sum + row.amount, 0n)).toBe(700000n);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).reserved).toBe(0n);
  });

  it('AC-FIN-14-8 (gate G6 không tranh chấp): delta tiền ngân hàng bằng delta tổng tài sản ví sau khi queue rỗng', async () => {
    const playerId = randomUUID();
    const personal = await personalWallet(playerId);
    const providerId = randomUUID();
    const business = await seedBusinessBalance(providerId, 600000n);
    const walletTotal = async () => (await prisma.wallet.findMany({ where: { id: { in: [personal.id, business.id] } } }))
      .reduce((sum, wallet) => sum + wallet.available + wallet.pending + wallet.reserved, 0n);
    const before = await walletTotal();

    const inRef = randomUUID();
    await handleIncomingTransfer({ externalRef: inRef, amount: 200000n, rawRef: `UNKNOWN-${randomUUID()}` });
    const inEvent = await prisma.sepayEvent.findUniqueOrThrow({ where: { externalRef: inRef } });
    await assignIncomingEvent(adminId, inEvent.id, playerId, 'Tiền vào đã xác minh');

    const request = await createWithdrawal(providerId, { amount: 600000n, ...bank });
    const outRef = randomUUID();
    await handleOutgoingTransfer({ externalRef: outRef, amount: 600000n, rawRef: request.transferCode });

    const after = await walletTotal();
    const bankDelta = 200000n - 600000n;
    const walletDelta = after - before;
    expect(walletDelta).toBe(bankDelta);
    expect(await prisma.sepayEvent.count({ where: { id: { in: [inEvent.id, (await prisma.sepayEvent.findUniqueOrThrow({ where: { externalRef: outRef } })).id] }, status: 'unmatched' } })).toBe(0);
  });

  it('AC-FIN-14-8 gate G7: nạp + hai đường thanh toán + hoàn 50% + tranh chấp + payout bảo toàn hệ thống', async () => {
    const totalWalletAssets = async () => (await prisma.wallet.findMany())
      .reduce((sum, wallet) => sum + wallet.available + wallet.pending + wallet.reserved, 0n);
    const globalWalletBefore = await totalWalletAssets();
    const unmatchedBefore = await prisma.sepayEvent.count({ where: { status: 'unmatched' } });
    const balanceBookingId = randomUUID();
    const directBookingId = randomUUID();
    const balanceUserId = randomUUID();
    const directUserId = randomUUID();
    const balanceBusinessUserId = randomUUID();
    const directBusinessUserId = randomUUID();
    const statuses = new Map([
      [balanceBookingId, { bookingId: balanceBookingId, userId: balanceUserId, status: 'held', gross: '200000', stillPayable: true }],
      [directBookingId, { bookingId: directBookingId, userId: directUserId, status: 'held', gross: '200000', stillPayable: true }],
    ]);
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const bookingId = String(input).split('/').at(-2)!;
      return new Response(JSON.stringify(statuses.get(bookingId)), { status: statuses.has(bookingId) ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
    });
    try {
      const topupIntent = await createTopupIntent(balanceUserId, 300000n);
      const topupRef = randomUUID();
      await handleIncomingTransfer({ externalRef: topupRef, amount: 300000n, rawRef: topupIntent.matchCode });
      await payBookingWithBalance(balanceUserId, balanceBookingId);

      const directCode = `DIRECT${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      await prisma.paymentIntent.create({ data: { userId: directUserId, amount: 200000n, method: 'sepay', refType: 'booking', refId: directBookingId, matchCode: directCode } });
      const directRef = randomUUID();
      await handleIncomingTransfer({ externalRef: directRef, amount: 200000n, rawRef: directCode });

      await recordBookingRevenue(randomUUID(), { bookingId: balanceBookingId, businessUserId: balanceBusinessUserId, venueId: randomUUID(), gross: '200000', endAt: new Date(Date.now() + 10 * 3_600_000).toISOString(), source: 'marketplace' });
      await recordBookingRevenue(randomUUID(), { bookingId: directBookingId, businessUserId: directBusinessUserId, venueId: randomUUID(), gross: '200000', endAt: new Date(Date.now() - 5 * 3_600_000).toISOString(), source: 'marketplace' });
      await refundCancelledBooking(randomUUID(), { bookingId: balanceBookingId, userId: balanceUserId, businessUserId: balanceBusinessUserId, gross: '200000', refundPercent: 50, reason: 'self' });
      const dispute = await createDispute(directUserId, { bookingId: directBookingId, reason: 'Dịch vụ không đúng', evidence: ['proof'] });
      await resolveDispute(adminId, dispute.id, { decision: 'partial_refund', amount: 80000n, reason: 'Hoàn theo bằng chứng' });

      const withdrawal = await createWithdrawal(directBusinessUserId, { amount: 100000n, ...bank });
      const payoutRef = randomUUID();
      await handleOutgoingTransfer({ externalRef: payoutRef, amount: 100000n, rawRef: withdrawal.transferCode });

      const personal = await prisma.wallet.findFirstOrThrow({ where: { userId: balanceUserId, walletType: 'personal' } });
      const directPersonal = await prisma.wallet.findFirstOrThrow({ where: { userId: directUserId, walletType: 'personal' } });
      const balanceBusiness = await prisma.wallet.findFirstOrThrow({ where: { userId: balanceBusinessUserId, walletType: 'business' } });
      const directBusiness = await prisma.wallet.findFirstOrThrow({ where: { userId: directBusinessUserId, walletType: 'business' } });
      const platform = await prisma.wallet.findFirstOrThrow({ where: { walletType: 'platform' } });
      const platformForScenario = (await prisma.ledgerEntry.findMany({ where: { walletId: platform.id, refId: { in: [balanceBookingId, directBookingId, dispute.id] } } })).reduce((sum, row) => sum + row.amount, 0n);
      const walletAssets = personal.available + directPersonal.available + balanceBusiness.pending + balanceBusiness.available + balanceBusiness.reserved + directBusiness.pending + directBusiness.available + directBusiness.reserved + platformForScenario;
      const bankNet = 300000n + 200000n - 100000n;
      expect(walletAssets).toBe(bankNet);
      expect((await totalWalletAssets()) - globalWalletBefore).toBe(bankNet);
      expect(await prisma.sepayEvent.count({ where: { status: 'unmatched' } })).toBe(unmatchedBefore);
      expect([personal.available, directPersonal.available, balanceBusiness.pending, directBusiness.available, platformForScenario]).toEqual([200000n, 80000n, 90000n, 8000n, 22000n]);

      const events = await prisma.sepayEvent.findMany({ where: { externalRef: { in: [topupRef, directRef, payoutRef] } }, include: { allocations: true } });
      expect(events).toHaveLength(3);
      for (const event of events) expect(event.allocations.reduce((sum, row) => sum + row.amount, 0n)).toBe(event.amount);
    } finally {
      vi.unstubAllGlobals();
    }
  }, 15000);
});
