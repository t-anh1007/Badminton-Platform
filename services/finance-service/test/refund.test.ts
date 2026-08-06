import { afterAll, describe, expect, it } from 'vitest';
import * as eventConsumer from '../src/lib/eventConsumer.js';
import { prisma } from '../src/lib/prisma.js';
import { randomUUID } from 'node:crypto';
import { recordBookingRevenue } from '../src/domain/revenue.js';
import { getOrCreateWallet } from '../src/domain/wallet.js';

type BookingCancelledPayload = {
  bookingId: string;
  userId: string;
  businessUserId: string;
  gross: string;
  refundPercent: number;
  reason: 'self' | 'provider_fault' | 'platform_admin';
  cancellationNote?: string;
};

const handleBookingCancelled = (eventConsumer as unknown as {
  handleBookingCancelled(eventId: string, payload: BookingCancelledPayload): Promise<void>;
}).handleBookingCancelled;

async function setupConfirmedFinance(gross = 200000n) {
  const bookingId = randomUUID();
  const userId = randomUUID();
  const businessUserId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await getOrCreateWallet(tx, userId, 'personal');
    await tx.paymentIntent.create({
      data: {
        userId,
        amount: gross,
        method: 'sepay',
        refType: 'booking',
        refId: bookingId,
        matchCode: `TEST${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        status: 'completed',
      },
    });
  });
  const platformBefore = (await prisma.wallet.findFirst({ where: { walletType: 'platform' } }))?.available ?? 0n;
  await recordBookingRevenue(randomUUID(), { bookingId, businessUserId, gross: gross.toString() });
  return { bookingId, userId, businessUserId, gross, platformBefore };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('FIN-07/08 — consumer BookingCancelled', () => {
  it('có entrypoint consumer công khai để queue và integration test dùng cùng implementation', () => {
    expect(typeof (eventConsumer as Record<string, unknown>).handleBookingCancelled).toBe('function');
  });

  for (const [refundPercent, expectedRefund, expectedNet, expectedCommission] of [
    [100, 200000n, 0n, 0n],
    [50, 100000n, 90000n, 10000n],
    [0, 0n, 180000n, 20000n],
  ] as const) {
    it(`AC-FIN-07-1..5: tự hủy mức ${refundPercent}% đảo đủ ba vế và bảo toàn 200000`, async () => {
      const fixture = await setupConfirmedFinance();
      const eventId = randomUUID();
      await handleBookingCancelled(eventId, { ...fixture, gross: fixture.gross.toString(), refundPercent, reason: 'self' });

      const personal = await prisma.wallet.findFirstOrThrow({ where: { userId: fixture.userId, walletType: 'personal' } });
      const business = await prisma.wallet.findFirstOrThrow({ where: { userId: fixture.businessUserId, walletType: 'business' } });
      const platform = await prisma.wallet.findFirstOrThrow({ where: { walletType: 'platform' } });
      expect(personal.available).toBe(expectedRefund);
      expect(business.pending).toBe(expectedNet);
      expect(platform.available - fixture.platformBefore).toBe(expectedCommission);
      expect(personal.available + business.pending + (platform.available - fixture.platformBefore)).toBe(200000n);

      const reversals = await prisma.ledgerEntry.findMany({ where: { refId: fixture.bookingId, type: 'refund' } });
      expect(reversals.map((entry) => entry.amount).sort((a, b) => Number(a - b))).toEqual(
        refundPercent === 0 ? [] : [-expectedRefund * 9n / 10n, -expectedRefund / 10n, expectedRefund].sort((a, b) => Number(a - b)),
      );
    });
  }

  it('AC-FIN-07-6: replay cùng event không ghi thêm bút toán', async () => {
    const fixture = await setupConfirmedFinance();
    const eventId = randomUUID();
    const payload = { ...fixture, gross: fixture.gross.toString(), refundPercent: 50, reason: 'self' as const };
    await handleBookingCancelled(eventId, payload);
    const count = await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } });
    await handleBookingCancelled(eventId, payload);
    expect(await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } })).toBe(count);
  });

  it('AC-FIN-07-6: event ID mới cho cùng booking không hoàn lần hai', async () => {
    const fixture = await setupConfirmedFinance();
    const payload = { ...fixture, gross: fixture.gross.toString(), refundPercent: 50, reason: 'self' as const };
    await handleBookingCancelled(randomUUID(), payload);
    const count = await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } });

    await handleBookingCancelled(randomUUID(), payload);

    expect(await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } })).toBe(count);
  });

  it('từ chối gross không khớp thanh toán và doanh thu gốc, không chạm ledger', async () => {
    const fixture = await setupConfirmedFinance();
    const count = await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } });

    await expect(handleBookingCancelled(randomUUID(), {
      ...fixture,
      gross: (fixture.gross + 100000n).toString(),
      refundPercent: 100,
      reason: 'provider_fault',
    })).rejects.toThrow(/không khớp/i);

    expect(await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } })).toBe(count);
  });

  it('từ chối businessUserId không sở hữu doanh thu gốc, không chạm ledger', async () => {
    const fixture = await setupConfirmedFinance();
    const otherBusinessUserId = randomUUID();
    await prisma.$transaction(async (tx) => { await getOrCreateWallet(tx, otherBusinessUserId, 'business'); });
    const count = await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } });

    await expect(handleBookingCancelled(randomUUID(), {
      ...fixture,
      businessUserId: otherBusinessUserId,
      gross: fixture.gross.toString(),
      refundPercent: 100,
      reason: 'provider_fault',
    })).rejects.toThrow(/không khớp/i);

    expect(await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } })).toBe(count);
  });

  it('từ chối userId không phải người thanh toán booking, không chạm ledger', async () => {
    const fixture = await setupConfirmedFinance();
    const count = await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } });

    await expect(handleBookingCancelled(randomUUID(), {
      ...fixture,
      userId: randomUUID(),
      gross: fixture.gross.toString(),
      refundPercent: 100,
      reason: 'provider_fault',
    })).rejects.toThrow(/không khớp/i);

    expect(await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } })).toBe(count);
  });

  it('AC-FIN-08-1..5: lỗi phía sân luôn hoàn 100%, đảo đủ ba vế và giữ nguyên bút toán gốc', async () => {
    const fixture = await setupConfirmedFinance();
    const original = await prisma.ledgerEntry.findMany({ where: { refId: fixture.bookingId } });
    await handleBookingCancelled(randomUUID(), {
      ...fixture,
      gross: fixture.gross.toString(),
      refundPercent: 100,
      reason: 'provider_fault',
      cancellationNote: 'Sân gặp sự cố',
    });

    const personal = await prisma.wallet.findFirstOrThrow({ where: { userId: fixture.userId, walletType: 'personal' } });
    const business = await prisma.wallet.findFirstOrThrow({ where: { userId: fixture.businessUserId, walletType: 'business' } });
    const platform = await prisma.wallet.findFirstOrThrow({ where: { walletType: 'platform' } });
    expect([personal.available, business.pending, platform.available - fixture.platformBefore]).toEqual([200000n, 0n, 0n]);
    for (const entry of original) {
      expect(await prisma.ledgerEntry.findUnique({ where: { id: entry.id } })).toMatchObject(entry);
    }
  });

  it('payload malformed không được mặc định thành provider_fault và không chạm ví', async () => {
    const fixture = await setupConfirmedFinance();
    const personalBefore = await prisma.wallet.findFirstOrThrow({ where: { userId: fixture.userId, walletType: 'personal' } });
    const businessBefore = await prisma.wallet.findFirstOrThrow({ where: { userId: fixture.businessUserId, walletType: 'business' } });
    const platformBefore = await prisma.wallet.findFirstOrThrow({ where: { walletType: 'platform' } });

    await expect(handleBookingCancelled(randomUUID(), {
      ...fixture,
      gross: fixture.gross.toString(),
      refundPercent: 100,
      reason: 'typo' as 'provider_fault',
    })).rejects.toBeDefined();

    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: personalBefore.id } })).available).toBe(personalBefore.available);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: businessBefore.id } })).pending).toBe(businessBefore.pending);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: platformBefore.id } })).available).toBe(platformBefore.available);
  });
});
