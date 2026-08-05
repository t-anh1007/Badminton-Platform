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

  it.skip('AC-ACC-08-4: NCC đang bị khóa, người chơi gọi thẳng API tạo booking mới -> từ chối [BLOCKED: chờ G3 — cần endpoint booking marketplace (BOK-07) chưa xây; cơ chế provider.status=suspended đã sẵn sàng để G3 dùng]', () => {});
});
