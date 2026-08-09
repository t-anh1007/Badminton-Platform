import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { recordBookingRevenue } from '../src/domain/revenue.js';
import { listBusinessRevenue, releaseMatureRevenue } from '../src/domain/revenueRelease.js';

async function revenueFixture(hoursAfterEnd = 25) {
  const bookingId = randomUUID();
  const businessUserId = randomUUID();
  const venueId = randomUUID();
  const endAt = new Date(Date.now() - hoursAfterEnd * 3_600_000);
  await recordBookingRevenue(randomUUID(), {
    bookingId,
    businessUserId,
    venueId,
    gross: '200000',
    endAt: endAt.toISOString(),
    source: 'marketplace',
  });
  return { bookingId, businessUserId, venueId, endAt };
}

afterAll(async () => prisma.$disconnect());

describe('FIN-09 — hiển thị và đáo hạn doanh thu', () => {
  it('xử lý hai BookingConfirmed đồng thời trên ví platform chưa tồn tại', async () => {
    const events = [0, 1].map(() => ({
      bookingId: randomUUID(),
      businessUserId: randomUUID(),
      venueId: randomUUID(),
      gross: '200000',
      endAt: new Date().toISOString(),
      source: 'marketplace' as const,
    }));

    await expect(
      Promise.all(events.map((payload) => recordBookingRevenue(randomUUID(), payload))),
    ).resolves.toBeDefined();
    expect(await prisma.wallet.count({ where: { userId: null, walletType: 'platform' } })).toBe(1);
  });

  it('AC-FIN-09-4: qua endAt + 24h chuyển đúng khoản pending sang available, không sinh ledger nội bộ', async () => {
    const fixture = await revenueFixture(25);
    const walletBefore = await prisma.wallet.findFirstOrThrow({
      where: { userId: fixture.businessUserId, walletType: 'business' },
    });
    const ledgerCount = await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } });

    expect(await releaseMatureRevenue(new Date())).toBeGreaterThanOrEqual(1);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletBefore.id } });
    expect([wallet.pending, wallet.available]).toEqual([0n, 180000n]);
    expect(await prisma.ledgerEntry.count({ where: { refId: fixture.bookingId } })).toBe(ledgerCount);
    expect(
      (await prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: fixture.bookingId } })).releasedAt,
    ).not.toBeNull();
  });

  it('AC-FIN-09-5: tranh chấp open chỉ hoãn booking đó, booking khác vẫn release', async () => {
    const blocked = await revenueFixture(25);
    const released = await revenueFixture(25);
    await prisma.dispute.create({
      data: {
        refType: 'booking',
        refId: blocked.bookingId,
        bookingId: blocked.bookingId,
        raiserUserId: randomUUID(),
        deadlineAt: new Date(Date.now() + 3_600_000),
        status: 'open',
      },
    });

    await releaseMatureRevenue(new Date());

    expect(
      (await prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: blocked.bookingId } })).releasedAt,
    ).toBeNull();
    expect(
      (await prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: released.bookingId } })).releasedAt,
    ).not.toBeNull();
  });

  it('skips cancelled revenue without blocking other mature bookings', async () => {
    const cancelled = await revenueFixture(25);
    const releasable = await revenueFixture(25);
    const cancelledRevenue = await prisma.bookingRevenue.update({
      where: { bookingId: cancelled.bookingId },
      data: { cancelledAt: new Date() },
    });
    await prisma.wallet.update({
      where: { id: cancelledRevenue.businessWalletId },
      data: { pending: 0n },
    });

    await expect(releaseMatureRevenue(new Date())).resolves.toBeGreaterThanOrEqual(1);
    expect(
      (await prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: cancelled.bookingId } })).releasedAt,
    ).toBeNull();
    expect(
      (await prisma.bookingRevenue.findUniqueOrThrow({ where: { bookingId: releasable.bookingId } })).releasedAt,
    ).not.toBeNull();
  });

  it('AC-FIN-09-6: booking internal không tạo revenue/commission và không xuất hiện', async () => {
    const bookingId = randomUUID();
    const businessUserId = randomUUID();
    await recordBookingRevenue(randomUUID(), {
      bookingId,
      businessUserId,
      venueId: randomUUID(),
      gross: '200000',
      endAt: new Date().toISOString(),
      source: 'internal',
    });

    expect(await prisma.bookingRevenue.findUnique({ where: { bookingId } })).toBeNull();
    expect(await prisma.ledgerEntry.count({ where: { refId: bookingId } })).toBe(0);
    expect(await listBusinessRevenue(businessUserId, {})).toEqual([]);
  });

  it('màn hình doanh thu chỉ trả khoản của chính provider và lọc theo venue', async () => {
    const own = await revenueFixture(2);
    await revenueFixture(2);
    const rows = await listBusinessRevenue(own.businessUserId, { venueId: own.venueId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ bookingId: own.bookingId, gross: 200000n, net: 180000n, commission: 20000n });
  });

  it('BookingConfirmed malformed không thể tạo tiền', async () => {
    const bookingId = randomUUID();
    await expect(
      recordBookingRevenue(randomUUID(), {
        bookingId,
        businessUserId: randomUUID(),
        gross: '-200000',
        venueId: randomUUID(),
        endAt: new Date().toISOString(),
        source: 'marketplace',
      }),
    ).rejects.toBeDefined();
    expect(await prisma.ledgerEntry.count({ where: { refId: bookingId } })).toBe(0);
  });
});
