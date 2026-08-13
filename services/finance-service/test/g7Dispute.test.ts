import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { createDispute, resolveDispute } from '../src/domain/dispute.js';
import { recordBookingRevenue } from '../src/domain/revenue.js';
import { releaseBookingRevenue, releaseMatureRevenue } from '../src/domain/revenueRelease.js';
import { refundCancelledBooking } from '../src/domain/refund.js';

async function disputeFixture(hoursAfterEnd = 5) {
  const bookingId = randomUUID();
  const playerId = randomUUID();
  const businessUserId = randomUUID();
  const endAt = new Date(Date.now() - hoursAfterEnd * 3_600_000);
  await prisma.paymentIntent.create({
    data: { userId: playerId, amount: 200000n, method: 'sepay', refType: 'booking', refId: bookingId, status: 'completed' },
  });
  await recordBookingRevenue(randomUUID(), {
    bookingId, businessUserId, venueId: randomUUID(), gross: '200000', endAt: endAt.toISOString(), source: 'marketplace',
  });
  return { bookingId, playerId, businessUserId, endAt };
}

afterAll(async () => prisma.$disconnect());

describe('FIN-12 — gửi tranh chấp trong cửa sổ 24 giờ', () => {
  it('AC-FIN-12-1: tạo open trong cửa sổ và giữ riêng doanh thu booking ở pending', async () => {
    const fixture = await disputeFixture(5);
    const dispute = await createDispute(fixture.playerId, {
      bookingId: fixture.bookingId, reason: 'Sân không cung cấp đúng dịch vụ', evidence: ['https://example.test/evidence.jpg'],
    });
    expect(dispute).toMatchObject({ bookingId: fixture.bookingId, raiserUserId: fixture.playerId, status: 'open' });
    await releaseMatureRevenue(new Date(fixture.endAt.getTime() + 25 * 3_600_000), [fixture.bookingId]);
    const revenue = await prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: fixture.bookingId } });
    expect(revenue.releasedAt).toBeNull();
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: revenue.businessWalletId } })).pending).toBe(180000n);
  });

  it('AC-FIN-12-2/3: từ chối sau hạn và trước khi ca kết thúc', async () => {
    const expired = await disputeFixture(30);
    await expect(createDispute(expired.playerId, { bookingId: expired.bookingId, reason: 'Quá muộn', evidence: [] }))
      .rejects.toMatchObject({ code: 'DISPUTE_EXPIRED' });
    const future = await disputeFixture(-2);
    await expect(createDispute(future.playerId, { bookingId: future.bookingId, reason: 'Ca chưa kết thúc', evidence: [] }))
      .rejects.toMatchObject({ code: 'BOOKING_NOT_ENDED' });
  });

  it('AC-FIN-12-4/5: một booking chỉ có một dispute và chỉ đúng người trả được gửi', async () => {
    const fixture = await disputeFixture();
    await expect(createDispute(randomUUID(), { bookingId: fixture.bookingId, reason: 'Không sở hữu', evidence: [] }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await createDispute(fixture.playerId, { bookingId: fixture.bookingId, reason: 'Lần đầu', evidence: [] });
    await expect(createDispute(fixture.playerId, { bookingId: fixture.bookingId, reason: 'Lần hai', evidence: [] }))
      .rejects.toMatchObject({ code: 'DISPUTE_EXISTS' });
  });

  it('booking đã hủy kể cả mức hoàn 0% không được tranh chấp để hoàn lần hai', async () => {
    const fixture = await disputeFixture();
    await refundCancelledBooking(randomUUID(), {
      bookingId: fixture.bookingId, userId: fixture.playerId, businessUserId: fixture.businessUserId,
      gross: '200000', refundPercent: 0, reason: 'self',
    });
    await expect(createDispute(fixture.playerId, { bookingId: fixture.bookingId, reason: 'Đòi hoàn lần hai', evidence: [] }))
      .rejects.toMatchObject({ code: 'BOOKING_CANCELLED' });
  });

  it('AC-FIN-12-6: race đúng mốc 24 giờ không bao giờ vừa release vừa mở dispute, lặp 20 lần', async () => {
    for (let index = 0; index < 20; index += 1) {
      const fixture = await disputeFixture(0);
      const boundary = new Date(fixture.endAt.getTime() + 24 * 3_600_000);
      await prisma.bookingRevenue.update({ where: { bookingId: fixture.bookingId }, data: { endAt: new Date(boundary.getTime() - 24 * 3_600_000), releaseAt: boundary } });
      const [opened] = await Promise.allSettled([
        createDispute(fixture.playerId, { bookingId: fixture.bookingId, reason: 'Race boundary', evidence: [] }, boundary),
        releaseBookingRevenue(fixture.bookingId, boundary),
      ]);
      const [dispute, revenue] = await Promise.all([
        prisma.dispute.findFirst({ where: { bookingId: fixture.bookingId, status: 'open' } }),
        prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: fixture.bookingId } }),
      ]);
      expect(Boolean(dispute)).not.toBe(Boolean(revenue.releasedAt));
      expect(opened.status === 'fulfilled').toBe(Boolean(dispute));
    }
  }, 30_000);
});

describe('FIN-13 — Admin giải quyết tranh chấp', () => {
  it('AC-FIN-13-1/7/8: hoàn toàn bộ đảo ba vế, bảo toàn và giữ nguyên bút toán gốc', async () => {
    const fixture = await disputeFixture();
    const originalIds = (await prisma.ledgerEntry.findMany({ where: { refId: fixture.bookingId } })).map((row) => row.id);
    const dispute = await createDispute(fixture.playerId, { bookingId: fixture.bookingId, reason: 'Không được chơi', evidence: [] });
    await resolveDispute(randomUUID(), dispute.id, { decision: 'full_refund', reason: 'Bằng chứng hợp lệ' });
    const [personal, business, resolved, revenue] = await Promise.all([
      prisma.wallet.findFirstOrThrow({ where: { userId: fixture.playerId, walletType: 'personal' } }),
      prisma.wallet.findFirstOrThrow({ where: { userId: fixture.businessUserId, walletType: 'business' } }),
      prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } }),
      prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: fixture.bookingId } }),
    ]);
    expect([personal.available, business.pending, business.available]).toEqual([200000n, 0n, 0n]);
    expect((await prisma.ledgerEntry.findFirstOrThrow({ where: { refType: 'dispute', refId: dispute.id, type: 'refund', amount: -20000n } })).amount).toBe(-20000n);
    expect(personal.available + revenue.net + revenue.commission).toBe(200000n);
    expect(resolved).toMatchObject({ status: 'resolved', resolution: 'full_refund', resolutionAmount: 200000n });
    const currentIds = (await prisma.ledgerEntry.findMany({ where: { id: { in: originalIds } } })).map((row) => row.id);
    expect(currentIds.sort()).toEqual(originalIds.sort());
    expect(await prisma.ledgerEntry.count({ where: { refType: 'dispute', refId: dispute.id } })).toBe(3);
  });

  it('AC-FIN-13-2/8: hoàn 80k rồi release phần ròng còn lại, tổng ba vế vẫn bằng gross', async () => {
    const fixture = await disputeFixture();
    const dispute = await createDispute(fixture.playerId, { bookingId: fixture.bookingId, reason: 'Dịch vụ thiếu', evidence: [] });
    await resolveDispute(randomUUID(), dispute.id, { decision: 'partial_refund', amount: 80000n, reason: 'Hoàn một phần' });
    const revenue = await prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: fixture.bookingId } });
    const [personal, business] = await Promise.all([
      prisma.wallet.findFirstOrThrow({ where: { userId: fixture.playerId, walletType: 'personal' } }),
      prisma.wallet.findUniqueOrThrow({ where: { id: revenue.businessWalletId } }),
    ]);
    expect([personal.available, business.pending, business.available]).toEqual([80000n, 0n, 108000n]);
    expect((await prisma.ledgerEntry.findFirstOrThrow({ where: { refType: 'dispute', refId: dispute.id, type: 'refund', amount: -8000n } })).amount).toBe(-8000n);
    expect(personal.available + revenue.net + revenue.commission).toBe(200000n);
  });

  it('AC-FIN-13-3: bác không ghi ledger tiền và release toàn bộ doanh thu', async () => {
    const fixture = await disputeFixture();
    const dispute = await createDispute(fixture.playerId, { bookingId: fixture.bookingId, reason: 'Khiếu nại', evidence: [] });
    const before = await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } });
    await resolveDispute(randomUUID(), dispute.id, { decision: 'rejected', reason: 'Không đủ bằng chứng' });
    const revenue = await prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: fixture.bookingId } });
    const business = await prisma.wallet.findUniqueOrThrow({ where: { id: revenue.businessWalletId } });
    const personal = await prisma.wallet.findFirst({ where: { userId: fixture.playerId, walletType: 'personal' } });
    const platform = await prisma.wallet.findFirstOrThrow({ where: { userId: null, walletType: 'platform' } });
    const platformContribution = (await prisma.ledgerEntry.findMany({
      where: { walletId: platform.id, OR: [{ refId: fixture.bookingId }, { refId: dispute.id }] },
    })).reduce((sum, entry) => sum + entry.amount, 0n);
    expect([business.pending, business.available]).toEqual([0n, 180000n]);
    expect((personal?.available ?? 0n) + revenue.net + platformContribution).toBe(200000n);
    expect(await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } })).toBe(before);
  });

  it('AC-FIN-13-4/5/6: chặn hoàn vượt gross, lý do rỗng và quyết định lại', async () => {
    const fixture = await disputeFixture();
    const dispute = await createDispute(fixture.playerId, { bookingId: fixture.bookingId, reason: 'Khiếu nại', evidence: [] });
    await expect(resolveDispute(randomUUID(), dispute.id, { decision: 'partial_refund', amount: 300000n, reason: 'Sai' }))
      .rejects.toMatchObject({ code: 'INVALID_REFUND' });
    await expect(resolveDispute(randomUUID(), dispute.id, { decision: 'rejected', reason: ' ' }))
      .rejects.toBeDefined();
    await resolveDispute(randomUUID(), dispute.id, { decision: 'rejected', reason: 'Hợp lệ' });
    await expect(resolveDispute(randomUUID(), dispute.id, { decision: 'rejected', reason: 'Lần hai' }))
      .rejects.toMatchObject({ code: 'DISPUTE_RESOLVED' });
  });
});
