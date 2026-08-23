import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { activateCourt, activateVenueCourts, addCourt, deactivateCourt, deactivateVenueCourts, getCourtBookingHistory } from '../src/domain/court.js';
import { createApprovedProvider, createVenueWithCourt } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('VEN-04 — Quản lý danh sách sân con', () => {
  it('AC-VEN-04-1: thêm sân con -> active=true, thuộc đúng cơ sở', async () => {
    const provider = await createApprovedProvider();
    const { venue } = await createVenueWithCourt(provider.id);
    const court = await addCourt(provider.userId, venue.id, 'San moi', [{ objectKey: 'venue/images/court.webp' }]);
    expect(court.active).toBe(true);
    expect(court.venueId).toBe(venue.id);
  });

  it('AC-VEN-04-2: không có booking confirmed tương lai -> vô hiệu hóa thành công', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    await deactivateCourt(provider.userId, court.id);
    const updated = await prisma.court.findUniqueOrThrow({ where: { id: court.id } });
    expect(updated.active).toBe(false);
  });

  it('AC-VEN-04-3: còn 2 booking confirmed tương lai -> từ chối, liệt kê đúng 2 booking', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.booking.createMany({
      data: [
        { courtId: court.id, startAt: future, endAt: new Date(future.getTime() + 3600_000), source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'A', guestContact: '0900' },
        { courtId: court.id, startAt: new Date(future.getTime() + 7200_000), endAt: new Date(future.getTime() + 10800_000), source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'B', guestContact: '0901' },
      ],
    });

    await expect(deactivateCourt(provider.userId, court.id)).rejects.toSatisfy((err: unknown) => {
      const e = err as { code: string; meta?: { bookings?: unknown[] } };
      expect(e.code).toBe('BLOCKED_BY_FUTURE_BOOKINGS');
      expect(e.meta?.bookings).toHaveLength(2);
      return true;
    });
  });

  it('AC-VEN-04-4: sân đã active=false -> lịch sử booking vẫn còn nguyên', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.booking.create({
      data: { courtId: court.id, startAt: past, endAt: new Date(past.getTime() + 3600_000), source: 'internal', status: 'completed', priceSnapshot: 100000n, guestName: 'A', guestContact: '0900' },
    });
    await deactivateCourt(provider.userId, court.id);

    const history = await getCourtBookingHistory(provider.userId, court.id);
    expect(history).toHaveLength(1);
  });

  it('AC-VEN-04-5: không có booking confirmed nhưng có HOLD còn 4 phút -> từ chối, cho biết thời điểm hết hạn', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const start = new Date(Date.now() + 3600_000);
    const holdExpiresAt = new Date(Date.now() + 4 * 60 * 1000);
    await prisma.hold.create({
      data: { courtId: court.id, startAt: start, endAt: new Date(start.getTime() + 3600_000), userId: 'someone', expiresAt: holdExpiresAt },
    });

    await expect(deactivateCourt(provider.userId, court.id)).rejects.toMatchObject({
      code: 'BLOCKED_BY_ACTIVE_HOLD',
    });
  });

  it('ngừng cơ sở -> vô hiệu hóa đồng loạt toàn bộ sân con', async () => {
    const provider = await createApprovedProvider();
    const { venue, court } = await createVenueWithCourt(provider.id);
    const second = await addCourt(provider.userId, venue.id, 'Sân thứ hai', [{ objectKey: 'venue/images/court-2.webp' }]);

    await expect(deactivateVenueCourts(provider.userId, venue.id)).resolves.toBe(2);
    const courts = await prisma.court.findMany({ where: { id: { in: [court.id, second.id] } } });
    expect(courts.every((item) => item.active === false)).toBe(true);
  });

  it('ngừng cơ sở bị chặn -> không sân con nào bị vô hiệu hóa dở dang', async () => {
    const provider = await createApprovedProvider();
    const { venue, court } = await createVenueWithCourt(provider.id);
    const second = await addCourt(provider.userId, venue.id, 'Sân thứ hai', [{ objectKey: 'venue/images/court-2.webp' }]);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.booking.create({ data: { courtId: second.id, startAt: future, endAt: new Date(future.getTime() + 3600_000), source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'A', guestContact: '0900' } });

    await expect(deactivateVenueCourts(provider.userId, venue.id)).rejects.toMatchObject({ code: 'BLOCKED_BY_FUTURE_BOOKINGS' });
    const courts = await prisma.court.findMany({ where: { id: { in: [court.id, second.id] } } });
    expect(courts.every((item) => item.active === true)).toBe(true);
  });

  it('kích hoạt lại sân và cơ sở chỉ đổi active, giữ nguyên lịch sử booking', async () => {
    const provider = await createApprovedProvider();
    const { venue, court } = await createVenueWithCourt(provider.id);
    const second = await addCourt(provider.userId, venue.id, 'Sân thứ hai', [{ objectKey: 'venue/images/court-2.webp' }]);
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const booking = await prisma.booking.create({ data: { courtId: court.id, startAt: past, endAt: new Date(past.getTime() + 3600_000), source: 'internal', status: 'completed', priceSnapshot: 100000n, guestName: 'A', guestContact: '0900' } });
    await deactivateVenueCourts(provider.userId, venue.id);
    await activateCourt(provider.userId, court.id);
    await expect(activateVenueCourts(provider.userId, venue.id)).resolves.toBe(1);

    const courts = await prisma.court.findMany({ where: { id: { in: [court.id, second.id] } } });
    expect(courts.every((item) => item.active === true)).toBe(true);
    await expect(prisma.booking.findUnique({ where: { id: booking.id } })).resolves.toMatchObject({ id: booking.id, priceSnapshot: 100000n });
  });
});
