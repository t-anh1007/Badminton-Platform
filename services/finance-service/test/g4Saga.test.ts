import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Các test trong file này chờ round-trip THẬT qua RabbitMQ (outbox relay
// 500ms + hai chặng publish/consume) — nới timeout mặc định (5s) cho từng
// bài thay vì hy vọng luôn dưới 5s.
const IT_TIMEOUT_MS = 15000;
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { prisma } from '../src/lib/prisma.js';
import { payBookingWithBalance, createBookingSepayIntent } from '../src/domain/payment.js';
import { handleIncomingTransfer } from '../src/domain/sepayWebhook.js';
import { recordBookingRevenue } from '../src/domain/revenue.js';
import { getWalletsForUser } from '../src/domain/wallet.js';
import { bootstrapEventConsumption as finConsume } from '../src/lib/eventConsumer.js';
import { bootstrapEventPublishing as finPublish } from '../src/lib/rabbitmq.js';
import { fakeUserId, seedPersonalBalance, waitFor } from './helpers.js';

// Kiểm thử TÍCH HỢP THẬT bắc qua finance-service + venue-booking-service qua
// hàng đợi sự kiện thật (RabbitMQ) — đúng yêu cầu "Tiêu chí kiểm chứng" của
// AC-BOK-07-2/07-4, AC-FIN-04-3 trong court-booking.md/finance-disputes.md.
// Cả hai app THẬT được khởi động trong tiến trình test này (không mock).
import { createApp as createVenueApp } from '../../venue-booking-service/src/app.js';
import { prisma as vbPrisma } from '../../venue-booking-service/src/lib/prisma.js';
import { env as vbEnv } from '../../venue-booking-service/src/lib/env.js';
import { bootstrapEventConsumption as vbConsume } from '../../venue-booking-service/src/lib/eventConsumer.js';
import { bootstrapEventPublishing as vbPublish } from '../../venue-booking-service/src/lib/rabbitmq.js';
import { createHold } from '../../venue-booking-service/src/domain/hold.js';
import { createBookingFromHold } from '../../venue-booking-service/src/domain/booking.js';
import { cancelBookingByPlayer } from '../../venue-booking-service/src/domain/cancellation.js';
import { approveProvider } from '../../venue-booking-service/src/domain/provider.js';
import { createApprovedProvider, makeCourtSearchable, fakeUserId as vbFakeUserId } from '../../venue-booking-service/test/helpers.js';

let vbServer: Server;
let stopVbConsume: () => Promise<void>;
let stopVbPublish: () => void;
let stopFinConsume: () => Promise<void>;
let stopFinPublish: () => void;

beforeAll(async () => {
  const vbApp = createVenueApp();
  vbServer = vbApp.listen(vbEnv.port);
  await new Promise<void>((resolve) => vbServer.once('listening', () => resolve()));
  stopVbConsume = await vbConsume();
  stopVbPublish = await vbPublish();
  stopFinConsume = await finConsume();
  stopFinPublish = await finPublish();
}, 30000);

afterAll(async () => {
  await stopVbConsume();
  stopVbPublish();
  await stopFinConsume();
  stopFinPublish();
  await new Promise<void>((resolve) => vbServer.close(() => resolve()));
  await vbPrisma.$disconnect();
  await prisma.$disconnect();
}, 30000);

function tomorrowAt(hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function setupHeldBooking(price = 200000) {
  const userId = vbFakeUserId();
  const providerUserId = vbFakeUserId();
  const provider = await createApprovedProvider(providerUserId);
  const { court } = await makeCourtSearchable(provider.id, undefined, price);
  const start = tomorrowAt(9 + Math.floor(Math.random() * 10)); // tránh trùng slot giữa các test
  const end = new Date(start.getTime() + 3600_000);
  const hold = await createHold(userId, { courtId: court.id, startAt: start, endAt: end });
  const booking = await createBookingFromHold(userId, hold.id);
  return { userId, providerUserId, booking };
}

describe('FIN-03 — Thanh toán booking bằng số dư (tích hợp thật)', () => {
  it('AC-FIN-03-1: ví personal 300k, booking 200k held -> còn 100k, một bút toán payment 200k, PaymentCompleted phát, booking confirmed', async () => {
    const { userId, booking } = await setupHeldBooking(200000);
    await seedPersonalBalance(userId, 300000n);

    await payBookingWithBalance(userId, booking.id);

    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(100000n);
    const entries = await prisma.ledgerEntry.findMany({ where: { walletId: wallet!.id, type: 'payment' } });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amount).toBe(-200000n);

    await waitFor(
      () => vbPrisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
      (b) => b.status === 'confirmed',
    );
  }, IT_TIMEOUT_MS);

  it('AC-FIN-03-2: ví personal 100k, booking 200k -> từ chối, không bút toán nào được ghi', async () => {
    const { userId, booking } = await setupHeldBooking(200000);
    await seedPersonalBalance(userId, 100000n);

    await expect(payBookingWithBalance(userId, booking.id)).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });

    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(100000n);
    const entries = await prisma.ledgerEntry.findMany({ where: { walletId: wallet!.id } });
    expect(entries).toHaveLength(1); // chỉ đúng bút toán seed, không có payment
  });

  it('AC-FIN-03-3: vai provider có ví business 500k, ví personal 0đ -> từ chối vì ví business không chi được cho payment', async () => {
    const { userId, booking } = await setupHeldBooking(200000);
    const { seedBusinessBalance } = await import('./helpers.js');
    await seedBusinessBalance(userId, 500000n);

    await expect(payBookingWithBalance(userId, booking.id)).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });

    const wallets = await getWalletsForUser(userId);
    const business = wallets.find((w) => w.walletType === 'business')!;
    expect(business.available).toBe(500000n); // ví business không hề bị đụng tới
  });

  it('AC-FIN-03-4: hold vừa hết hạn -> từ chối, số dư không đổi', async () => {
    const { userId, booking } = await setupHeldBooking(200000);
    await seedPersonalBalance(userId, 300000n);
    await vbPrisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });

    await expect(payBookingWithBalance(userId, booking.id)).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });

    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(300000n);
  });
});

describe('FIN-04 — Thanh toán booking qua SePay (tích hợp thật)', () => {
  it('AC-FIN-04-1: booking 200k held, hold còn hạn, webhook 200k đúng mã -> booking confirmed, không bút toán nào vào ví', async () => {
    const { userId, booking } = await setupHeldBooking(200000);
    const { matchCode } = await createBookingSepayIntent(userId, booking.id);

    await handleIncomingTransfer({ externalRef: randomUUID(), amount: 200000n, rawRef: matchCode });

    await waitFor(
      () => vbPrisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
      (b) => b.status === 'confirmed',
    );
    const wallets = await getWalletsForUser(userId);
    expect(wallets).toHaveLength(0); // chưa từng có ví personal nào được tạo cho user này
  }, IT_TIMEOUT_MS);

  it('AC-FIN-04-2: booking 200k, người chơi chỉ chuyển 150k -> booking vẫn held, 150k ghi có vào ví personal', async () => {
    const { userId, booking } = await setupHeldBooking(200000);
    const { matchCode } = await createBookingSepayIntent(userId, booking.id);

    await handleIncomingTransfer({ externalRef: randomUUID(), amount: 150000n, rawRef: matchCode });

    const stillHeld = await vbPrisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stillHeld.status).toBe('held');
    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(150000n);
  });

  it('AC-FIN-04-3 [tích hợp]: hold đã hết hạn, webhook đúng mã về -> booking cancelled, toàn bộ tiền ghi có ví personal qua FIN-06', async () => {
    const { userId, booking } = await setupHeldBooking(200000);
    const { matchCode } = await createBookingSepayIntent(userId, booking.id);
    await vbPrisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });

    await handleIncomingTransfer({ externalRef: randomUUID(), amount: 200000n, rawRef: matchCode });

    const cancelled = await vbPrisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(cancelled.status).toBe('cancelled');
    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(200000n);
    // AC-FIN-06-3: refType='late_payment' để lịch sử NÊU RÕ đây là tiền về muộn.
    const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { walletId: wallet!.id, refType: 'late_payment' } });
    expect(entry.type).toBe('topup');
    expect(entry.refId).toBe(booking.id);
  });

  it('AC-FIN-04-4: webhook gửi lại (cùng externalRef) -> không thay đổi thứ hai', async () => {
    const { userId, booking } = await setupHeldBooking(200000);
    const { matchCode } = await createBookingSepayIntent(userId, booking.id);
    await vbPrisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const externalRef = randomUUID();

    await handleIncomingTransfer({ externalRef, amount: 200000n, rawRef: matchCode });
    await handleIncomingTransfer({ externalRef, amount: 200000n, rawRef: matchCode }); // redeliver

    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(200000n); // không cộng thêm lần hai
    const entries = await prisma.ledgerEntry.findMany({ where: { walletId: wallet!.id, refType: 'late_payment' } });
    expect(entries).toHaveLength(1);
  });
});

describe('FIN-06 — Nhận khoản thanh toán đến muộn (nhánh PaymentCompleted quá hạn)', () => {
  it('AC-FIN-06-1/2: booking cancelled do hết hạn hold, PaymentCompleted vẫn về (đường FIN-03/tức thời) -> ví personal +200k, booking khác trên slot không bị ảnh hưởng', async () => {
    const { userId, booking, providerUserId } = await setupHeldBooking(200000);
    await vbPrisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });

    // Booking khác, độc lập, đóng vai "slot đã có người khác đặt và xác nhận".
    const { booking: otherBooking } = await setupHeldBooking(150000);
    await seedPersonalBalance(otherBooking.userId, 150000n);
    await payBookingWithBalance(otherBooking.userId, otherBooking.id);

    // Kích PaymentCompleted trực tiếp cho booking đã hết hạn (mô phỏng tiền
    // về ngay sau khi hold vừa hết hạn) — venue-booking-service tự phát
    // PaymentTooLate, finance-service tiêu thụ và ghi có ví.
    const { handlePaymentCompleted } = await import('../../venue-booking-service/src/lib/eventConsumer.js');
    await handlePaymentCompleted(randomUUID(), { bookingId: booking.id });

    await waitFor(
      () => getWalletsForUser(userId),
      (wallets) => wallets.length > 0 && wallets[0]!.available === 200000n,
    );

    const otherAfter = await waitFor(
      () => vbPrisma.booking.findUniqueOrThrow({ where: { id: otherBooking.id } }),
      (b) => b.status === 'confirmed',
    );
    expect(otherAfter.status).toBe('confirmed'); // không bị ảnh hưởng
    void providerUserId;
  }, IT_TIMEOUT_MS);
});

describe('FIN-09 (phần G4) — Ghi doanh thu khi BookingConfirmed', () => {
  it('AC-FIN-09-1/2: xác nhận booking 200k -> BA VẾ CÂN BẰNG: personal -200k, business.pending +180k (r=10%), platform.available +20k', async () => {
    const { userId, providerUserId, booking } = await setupHeldBooking(200000);
    await seedPersonalBalance(userId, 300000n);

    await payBookingWithBalance(userId, booking.id);

    await waitFor(
      () => prisma.wallet.findFirst({ where: { userId: providerUserId, walletType: 'business' } }),
      (w) => !!w && w.pending === 180000n,
    );
    const business = await prisma.wallet.findFirstOrThrow({ where: { userId: providerUserId, walletType: 'business' } });
    const platform = await prisma.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } });
    const [personal] = await getWalletsForUser(userId);

    expect(business.pending).toBe(180000n);
    expect(platform.available).toBeGreaterThanOrEqual(20000n); // >= vì các test khác cũng cộng vào cùng ví platform dùng chung
    expect(personal!.available).toBe(100000n); // 300k - 200k

    const releaseEntry = await prisma.ledgerEntry.findFirstOrThrow({ where: { walletId: business.id, refId: booking.id, type: 'release' } });
    const commissionEntry = await prisma.ledgerEntry.findFirstOrThrow({ where: { walletId: platform.id, refId: booking.id, type: 'commission' } });
    expect(releaseEntry.amount + commissionEntry.amount).toBe(200000n); // BR-FIN-15: tổng luôn đúng gross
  }, IT_TIMEOUT_MS);

  it('AC-FIN-09-3 [idempotent]: BookingConfirmed phát lại (cùng eventId) -> không ghi doanh thu lần hai', async () => {
    const eventId = randomUUID();
    const bookingId = randomUUID();
    const businessUserId = randomUUID();

    const payload = { bookingId, businessUserId, gross: '100000', venueId: randomUUID(), endAt: new Date(Date.now() + 48 * 3_600_000).toISOString(), source: 'marketplace' as const };
    await recordBookingRevenue(eventId, payload);
    await recordBookingRevenue(eventId, payload); // redeliver

    const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId: businessUserId, walletType: 'business' } });
    expect(wallet.pending).toBe(90000n); // đúng MỘT lần, không cộng dồn
  });
});

// ─── G4-fix: các bất biến Codex bắt (D22) ────────────────────────────────────

describe('G4-fix P1: chống double-pay bằng số dư (khóa ví + unique index)', () => {
  it('Hai payBookingWithBalance ĐỒNG THỜI cùng booking -> đúng 1 thành công, ví trừ đúng 1 lần, đúng 1 bút toán payment', async () => {
    const { userId, booking } = await setupHeldBooking(200000);
    await seedPersonalBalance(userId, 500000n);

    const results = await Promise.allSettled([
      payBookingWithBalance(userId, booking.id),
      payBookingWithBalance(userId, booking.id),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason.code).toBe('ALREADY_PAID');

    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(300000n); // 500k - 200k (đúng MỘT lần)
    const payments = await prisma.ledgerEntry.findMany({ where: { refId: booking.id, type: 'payment' } });
    expect(payments).toHaveLength(1);
  }, IT_TIMEOUT_MS);
});

describe('G5 contract: BookingCancelled qua Outbox/RabbitMQ -> finance refund ledger', () => {
  it('tu huy booking da thanh toan tao refund va dao ba ve qua queue that', async () => {
    const { userId, booking } = await setupHeldBooking(200000);
    await seedPersonalBalance(userId, 300000n);
    await payBookingWithBalance(userId, booking.id);
    await waitFor(
      () => vbPrisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
      (value) => value.status === 'confirmed',
    );
    await waitFor(
      () => prisma.ledgerEntry.count({ where: { refId: booking.id, type: 'release' } }),
      (count) => count === 1,
    );

    const cancellation = await cancelBookingByPlayer(userId, booking.id);
    const expectedRefund = 200000n * BigInt(cancellation.refundPercent) / 100n;
    const refundEntries = await waitFor(
      () => prisma.ledgerEntry.findMany({ where: { refId: booking.id, type: 'refund' } }),
      (entries) => expectedRefund === 0n ? entries.length === 0 : entries.length === 3,
    );

    const personal = await prisma.wallet.findFirstOrThrow({ where: { userId, walletType: 'personal' } });
    expect(personal.available).toBe(100000n + expectedRefund);
    if (expectedRefund > 0n) {
      expect(refundEntries.reduce((sum, entry) => sum + entry.amount, 0n)).toBe(0n);
    }
  }, IT_TIMEOUT_MS);
});

describe('G4-fix P1: overpay SePay (D24)', () => {
  it('Chuyển 250k cho booking 200k còn hạn -> booking confirmed + 50k vào ví personal (refType=overpay)', async () => {
    const { userId, booking } = await setupHeldBooking(200000);
    const { matchCode } = await createBookingSepayIntent(userId, booking.id);

    await handleIncomingTransfer({ externalRef: randomUUID(), amount: 250000n, rawRef: matchCode });

    await waitFor(
      () => vbPrisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
      (b) => b.status === 'confirmed',
    );
    const [wallet] = await getWalletsForUser(userId);
    expect(wallet!.available).toBe(50000n); // đúng phần thừa, không mất tiền
    const excess = await prisma.ledgerEntry.findFirstOrThrow({ where: { walletId: wallet!.id, refType: 'overpay' } });
    expect(excess.amount).toBe(50000n);
    expect(excess.refId).toBe(booking.id);
  }, IT_TIMEOUT_MS);
});

describe('G4-fix P1: ví platform duy nhất (partial unique index)', () => {
  it('Hai recordBookingRevenue ĐỒNG THỜI (2 booking khác nhau) -> vẫn chỉ MỘT ví platform', async () => {
    await Promise.allSettled([
      recordBookingRevenue(randomUUID(), { bookingId: randomUUID(), businessUserId: randomUUID(), gross: '100000', venueId: randomUUID(), endAt: new Date(Date.now() + 48 * 3_600_000).toISOString(), source: 'marketplace' }),
      recordBookingRevenue(randomUUID(), { bookingId: randomUUID(), businessUserId: randomUUID(), gross: '100000', venueId: randomUUID(), endAt: new Date(Date.now() + 48 * 3_600_000).toISOString(), source: 'marketplace' }),
    ]);
    const platforms = await prisma.wallet.findMany({ where: { walletType: 'platform' } });
    expect(platforms).toHaveLength(1);
  }, IT_TIMEOUT_MS);
});

describe('AC-VEN-02-1 (D25): duyệt NCC -> ProviderApproved qua queue thật -> ví business được tạo', () => {
  it('approveProvider (venue) phát ProviderApproved -> finance tạo ví business rỗng cho NCC (kể cả chưa có doanh thu)', async () => {
    const providerUserId = vbFakeUserId();
    const provider = await vbPrisma.provider.create({ data: { userId: providerUserId, orgName: 'NCC Duyệt', status: 'pending' } });

    await approveProvider(provider.id); // ghi Outbox -> relay publish -> finance consume

    const wallet = await waitFor(
      () => prisma.wallet.findFirst({ where: { userId: providerUserId, walletType: 'business' } }),
      (w) => !!w,
    );
    expect(wallet!.available).toBe(0n); // AC-FIN-01-2: ví business tồn tại dù chưa có doanh thu
  }, IT_TIMEOUT_MS);
});
