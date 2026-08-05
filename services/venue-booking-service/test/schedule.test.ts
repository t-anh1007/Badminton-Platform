import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { setOperatingHours, addClosure } from '../src/domain/schedule.js';
import { createApprovedProvider, createVenueWithCourt } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

function tomorrowAt(hourUTC: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hourUTC, 0, 0, 0);
  return d;
}

describe('VEN-05 — Giờ hoạt động và ngày đóng cửa', () => {
  it('AC-VEN-05-1: sân chưa có booking -> khai báo giờ hoạt động cả tuần được lưu đúng', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    for (let weekday = 0; weekday <= 6; weekday++) {
      await setOperatingHours(provider.userId, court.id, weekday, 6 * 60, 22 * 60);
    }
    const rows = await prisma.operatingHour.findMany({ where: { courtId: court.id } });
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.openMinute === 360 && r.closeMinute === 1320)).toBe(true);
  });

  it('AC-VEN-05-2: có booking confirmed 19h ngày mai -> thêm ngày mai vào đóng cửa -> từ chối, chỉ đúng booking đó', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const start = tomorrowAt(19);
    const booking = await prisma.booking.create({
      data: { courtId: court.id, startAt: start, endAt: tomorrowAt(20), source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'A', guestContact: '0900' },
    });

    await expect(addClosure(provider.userId, court.id, start)).rejects.toSatisfy((err: unknown) => {
      const e = err as { code: string; meta?: { bookings?: { id: string }[] } };
      expect(e.code).toBe('BLOCKED_BY_FUTURE_BOOKINGS');
      expect(e.meta?.bookings?.map((b) => b.id)).toEqual([booking.id]);
      return true;
    });
  });

  it('AC-VEN-05-3: hủy booking đó (mô phỏng BOK-10, chưa xây) rồi thêm lại ngày đóng cửa -> thành công', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const start = tomorrowAt(19);
    const booking = await prisma.booking.create({
      data: { courtId: court.id, startAt: start, endAt: tomorrowAt(20), source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'A', guestContact: '0900' },
    });

    // Mô phỏng BOK-10 (G3/G5, chưa xây): chuyển booking sang cancelled trực tiếp.
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } });

    const closure = await addClosure(provider.userId, court.id, start);
    expect(closure.courtId).toBe(court.id);
  });

  it('AC-VEN-05-4: sân mở 6h-22h có booking lúc 21h -> thu hẹp giờ đóng về 20h -> từ chối', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const weekday = tomorrowAt(0).getUTCDay();
    await setOperatingHours(provider.userId, court.id, weekday, 6 * 60, 22 * 60);
    await prisma.booking.create({
      data: { courtId: court.id, startAt: tomorrowAt(21), endAt: tomorrowAt(22), source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'A', guestContact: '0900' },
    });

    await expect(
      setOperatingHours(provider.userId, court.id, weekday, 6 * 60, 20 * 60),
    ).rejects.toMatchObject({ code: 'BLOCKED_BY_FUTURE_BOOKINGS' });
  });

  it('AC-VEN-05-5: sân mở 8h-20h -> mở rộng thành 6h-22h -> thành công không cần kiểm tra gì thêm', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const weekday = tomorrowAt(0).getUTCDay();
    await setOperatingHours(provider.userId, court.id, weekday, 8 * 60, 20 * 60);
    await prisma.booking.create({
      data: { courtId: court.id, startAt: tomorrowAt(9), endAt: tomorrowAt(10), source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'A', guestContact: '0900' },
    });

    const result = await setOperatingHours(provider.userId, court.id, weekday, 6 * 60, 22 * 60);
    expect(result.openMinute).toBe(360);
    expect(result.closeMinute).toBe(1320);
  });

  it('AC-VEN-05-6: HOLD chưa hết hạn ở 19h ngày mai, không có booking confirmed -> từ chối; sau khi hold hết hạn -> thành công', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const start = tomorrowAt(19);
    const hold = await prisma.hold.create({
      data: { courtId: court.id, startAt: start, endAt: tomorrowAt(20), userId: 'someone', expiresAt: new Date(Date.now() + 5 * 60_000) },
    });

    await expect(addClosure(provider.userId, court.id, start)).rejects.toMatchObject({
      code: 'BLOCKED_BY_ACTIVE_HOLD',
    });

    // Giả lập hold hết hạn (thay vì chờ thật).
    await prisma.hold.update({ where: { id: hold.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const closure = await addClosure(provider.userId, court.id, start);
    expect(closure.courtId).toBe(court.id);
  });
});
