import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { getAvailabilitySchedule } from '../src/domain/availability.js';
import { createApprovedProvider, createVenueWithCourt } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

function tomorrowDayStart(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function vietnamMinute(day: Date, minute: number): Date {
  return new Date(day.getTime() + (minute - 7 * 60) * 60_000);
}

async function setup6to22(providerId: string) {
  const { court } = await createVenueWithCourt(providerId);
  const day = tomorrowDayStart();
  const weekday = day.getUTCDay();
  await prisma.operatingHour.create({ data: { courtId: court.id, weekday, openMinute: 6 * 60, closeMinute: 22 * 60 } });
  await prisma.pricingRule.create({
    data: { courtId: court.id, weekday, startMinute: 6 * 60, endMinute: 22 * 60, price: 100000n, effectiveFrom: new Date(Date.now() - 1000) },
  });
  await prisma.bookingRule.create({ data: { courtId: court.id, stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 180 } });
  return { court, day };
}

describe('BOK-04 — Xem lịch trống và giá hiện hành', () => {
  it('AC-BOK-04-1: sân mở 6h-22h bước 30 phút, ngày trống -> lưới đủ khung 6h-22h, không khung nào ngoài khoảng', async () => {
    const provider = await createApprovedProvider();
    const { court, day } = await setup6to22(provider.id);
    const schedule = await getAvailabilitySchedule(court.id, day);
    expect(schedule.closed).toBe(false);
    expect(schedule.slots[0]!.startMinute).toBe(6 * 60);
    expect(schedule.slots[schedule.slots.length - 1]!.endMinute).toBe(22 * 60);
    expect(schedule.slots.every((s) => s.startMinute >= 6 * 60 && s.endMinute <= 22 * 60)).toBe(true);
    expect(schedule.slots.every((s) => s.available)).toBe(true);
  });

  it('AC-BOK-04-2: khung 19h có booking confirmed -> hiển thị không khả dụng', async () => {
    const provider = await createApprovedProvider();
    const { court, day } = await setup6to22(provider.id);
    const start19 = vietnamMinute(day, 19 * 60);
    await prisma.booking.create({
      data: { courtId: court.id, startAt: start19, endAt: new Date(start19.getTime() + 3600_000), source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'A', guestContact: '0900' },
    });

    const schedule = await getAvailabilitySchedule(court.id, day);
    const slot19 = schedule.slots.find((s) => s.startMinute === 19 * 60);
    expect(slot19!.available).toBe(false);
    expect(schedule.slots.find((s) => s.startMinute === 12 * 60)!.available).toBe(true);
  });

  it('AC-BOK-04-3: khung 20h đang có HOLD của người khác chưa hết hạn -> không khả dụng', async () => {
    const provider = await createApprovedProvider();
    const { court, day } = await setup6to22(provider.id);
    const start20 = vietnamMinute(day, 20 * 60);
    await prisma.hold.create({
      data: { courtId: court.id, startAt: start20, endAt: new Date(start20.getTime() + 3600_000), userId: 'other', expiresAt: new Date(Date.now() + 5 * 60_000) },
    });

    const schedule = await getAvailabilitySchedule(court.id, day);
    const slot20 = schedule.slots.find((s) => s.startMinute === 20 * 60);
    expect(slot20!.available).toBe(false);
  });

  it('AC-BOK-04-4: cùng khung 20h, hold vừa hết hạn -> tải lại lịch, khung trở lại khả dụng', async () => {
    const provider = await createApprovedProvider();
    const { court, day } = await setup6to22(provider.id);
    const start20 = vietnamMinute(day, 20 * 60);
    const hold = await prisma.hold.create({
      data: { courtId: court.id, startAt: start20, endAt: new Date(start20.getTime() + 3600_000), userId: 'other', expiresAt: new Date(Date.now() + 5 * 60_000) },
    });

    let schedule = await getAvailabilitySchedule(court.id, day);
    expect(schedule.slots.find((s) => s.startMinute === 20 * 60)!.available).toBe(false);

    // Đồng hồ giả lập — vượt mốc 10 phút bằng cách chỉnh expiresAt về quá khứ.
    await prisma.hold.update({ where: { id: hold.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    schedule = await getAvailabilitySchedule(court.id, day);
    expect(schedule.slots.find((s) => s.startMinute === 20 * 60)!.available).toBe(true);
  });

  it('AC-BOK-04-5: booking nội bộ do chủ sân ghi tại quầy lúc 18h -> khung 18h không khả dụng', async () => {
    const provider = await createApprovedProvider();
    const { court, day } = await setup6to22(provider.id);
    const start18 = vietnamMinute(day, 18 * 60);
    await prisma.booking.create({
      data: { courtId: court.id, startAt: start18, endAt: new Date(start18.getTime() + 3600_000), source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'Khach quay', guestContact: '0900' },
    });

    const schedule = await getAvailabilitySchedule(court.id, day);
    expect(schedule.slots.find((s) => s.startMinute === 18 * 60)!.available).toBe(false);
  });

  it('AC-BOK-04-6: ngày nằm trong danh sách đóng cửa -> hiển thị nhãn đóng cửa cho toàn ngày', async () => {
    const provider = await createApprovedProvider();
    const { court, day } = await setup6to22(provider.id);
    await prisma.closure.create({ data: { courtId: court.id, date: day } });

    const schedule = await getAvailabilitySchedule(court.id, day);
    expect(schedule.closed).toBe(true);
    expect(schedule.slots).toHaveLength(0);
  });
});
