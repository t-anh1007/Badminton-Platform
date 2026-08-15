import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { handleAccountLocked } from '../src/lib/eventConsumer.js';
import { isVenueSearchable } from '../src/domain/venue.js';
import { createApprovedProvider, createVenueWithCourt, fakeUserId } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Consume AccountLocked — hoàn thành AC-ACC-08-3 (blocked từ G1)', () => {
  it('AC-ACC-08-3: khóa NCC có booking confirmed -> booking GIỮ NGUYÊN, cơ sở biến mất khỏi tìm kiếm', async () => {
    const userId = fakeUserId();
    const provider = await createApprovedProvider(userId);
    const { venue, court } = await createVenueWithCourt(provider.id);
    await prisma.operatingHour.create({ data: { courtId: court.id, weekday: 3, openMinute: 0, closeMinute: 1440 } });
    await prisma.pricingRule.create({
      data: { courtId: court.id, weekday: 3, startMinute: 0, endMinute: 1440, price: 100000n, effectiveFrom: new Date() },
    });
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const booking = await prisma.booking.create({
      data: { courtId: court.id, startAt: future, endAt: new Date(future.getTime() + 3600_000), source: 'marketplace', status: 'confirmed', priceSnapshot: 100000n, userId: 'player-x' },
    });

    expect(await isVenueSearchable(venue.id)).toBe(true);

    await handleAccountLocked(randomUUID(), { userId, locked: true, reason: 'vi pham', actorUserId: 'admin-1' });

    expect(await isVenueSearchable(venue.id)).toBe(false);
    const unchangedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchangedBooking.status).toBe('confirmed');

    const updatedProvider = await prisma.provider.findUniqueOrThrow({ where: { id: provider.id } });
    expect(updatedProvider.status).toBe('suspended');
  });

  it('Khôi phục tài khoản (AccountLocked locked=false) -> provider suspended-do-khóa trở lại approved, hiện lại trong tìm kiếm', async () => {
    const userId = fakeUserId();
    const provider = await createApprovedProvider(userId);
    const { venue, court } = await createVenueWithCourt(provider.id);
    await prisma.operatingHour.create({ data: { courtId: court.id, weekday: 3, openMinute: 0, closeMinute: 1440 } });
    await prisma.pricingRule.create({
      data: { courtId: court.id, weekday: 3, startMinute: 0, endMinute: 1440, price: 100000n, effectiveFrom: new Date() },
    });

    await handleAccountLocked(randomUUID(), { userId, locked: true, reason: 'vi pham', actorUserId: 'admin-1' });
    expect(await isVenueSearchable(venue.id)).toBe(false);

    await handleAccountLocked(randomUUID(), { userId, locked: false, reason: 'da xac minh', actorUserId: 'admin-1' });
    expect(await isVenueSearchable(venue.id)).toBe(true);
  });

  it('Idempotent: xử lý cùng eventId hai lần không thay đổi trạng thái lần thứ hai', async () => {
    const userId = fakeUserId();
    const provider = await createApprovedProvider(userId);
    const eventId = randomUUID();

    await handleAccountLocked(eventId, { userId, locked: true, reason: 'r', actorUserId: 'a' });
    // Admin (ngoài luồng) khôi phục thủ công NGAY SAU — nếu xử lý trùng lần 2
    // sẽ vô tình suspend lại lần nữa dù không có event mới.
    await prisma.provider.update({ where: { id: provider.id }, data: { status: 'approved', suspendedByAccountLock: false } });

    await handleAccountLocked(eventId, { userId, locked: true, reason: 'r', actorUserId: 'a' }); // redeliver cùng eventId

    const unchanged = await prisma.provider.findUniqueOrThrow({ where: { id: provider.id } });
    expect(unchanged.status).toBe('approved'); // KHÔNG bị suspend lại vì eventId đã xử lý
  });

  it('AC-ACC-08-4: NCC đang bị khóa, người chơi gọi thẳng API tạo hold (bước đầu của đặt sân) -> từ chối', async () => {
    // Hoàn thành ở G3: BR-BOK-01 "chỉ cơ sở thỏa BR-VEN-03 mới xuất hiện
    // trong tìm kiếm VÀ MỚI ĐẶT ĐƯỢC" — createHold (BOK-06) chặn ngay tại
    // bước sớm nhất của luồng đặt sân, không chỉ ẩn khỏi tìm kiếm (AC-08-3).
    // BOK-07 (tạo booking confirmed sau thanh toán) thuộc G4, nhưng không có
    // BOK-07 nào chạy được nếu bước giữ chỗ này đã bị chặn trước.
    const { createHold } = await import('../src/domain/hold.js');
    const userId = fakeUserId();
    const provider = await createApprovedProvider(userId);
    const { court } = await createVenueWithCourt(provider.id);

    await handleAccountLocked(randomUUID(), { userId, locked: true, reason: 'vi pham', actorUserId: 'admin-1' });

    const start = new Date(Date.now() + 24 * 60 * 60_000);
    const end = new Date(start.getTime() + 3600_000);
    await expect(
      createHold(fakeUserId(), { courtId: court.id, startAt: start, endAt: end }),
    ).rejects.toMatchObject({ code: 'VENUE_NOT_AVAILABLE' });
  });
});
