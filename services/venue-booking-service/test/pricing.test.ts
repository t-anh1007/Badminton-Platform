import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { setOperatingHours } from '../src/domain/schedule.js';
import { savePricingRules, getEffectivePricingWindows, calculateBookingPrice } from '../src/domain/pricing.js';
import { createApprovedProvider, createVenueWithCourt } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

const WEEKDAY = 3; // Thứ Tư — cố định để test không phụ thuộc ngày chạy

describe('VEN-06 — Thiết lập biểu giá theo lịch', () => {
  it('AC-VEN-06-1: sân mở 6h-22h, biểu giá phủ trọn không chồng lấn -> lưu, BOK-04 (getEffectivePricingWindows) đọc đúng', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    await setOperatingHours(provider.userId, court.id, WEEKDAY, 6 * 60, 22 * 60);

    await savePricingRules(
      provider.userId,
      court.id,
      [
        { weekday: WEEKDAY, startMinute: 6 * 60, endMinute: 17 * 60, price: 100000 },
        { weekday: WEEKDAY, startMinute: 17 * 60, endMinute: 22 * 60, price: 150000 },
      ],
      new Date(),
    );

    const windows = await getEffectivePricingWindows(court.id, WEEKDAY, new Date());
    expect(windows).toHaveLength(2);
    expect(windows[0]!.price).toBe(100000n);
    expect(windows[1]!.price).toBe(150000n);
  });

  it('AC-VEN-06-2: hai khung giá chồng lấn -> từ chối, chỉ ra đoạn chồng lấn', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    await setOperatingHours(provider.userId, court.id, WEEKDAY, 6 * 60, 22 * 60);

    await expect(
      savePricingRules(
        provider.userId,
        court.id,
        [
          { weekday: WEEKDAY, startMinute: 6 * 60, endMinute: 18 * 60, price: 100000 },
          { weekday: WEEKDAY, startMinute: 17 * 60, endMinute: 22 * 60, price: 150000 },
        ],
        new Date(),
      ),
    ).rejects.toMatchObject({ code: 'OVERLAPPING_WINDOWS' });
  });

  it('AC-VEN-06-3: giờ hoạt động 6h-22h nhưng biểu giá chỉ phủ 6h-20h -> từ chối, chỉ ra đoạn 20h-22h', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    await setOperatingHours(provider.userId, court.id, WEEKDAY, 6 * 60, 22 * 60);

    await expect(
      savePricingRules(
        provider.userId,
        court.id,
        [{ weekday: WEEKDAY, startMinute: 6 * 60, endMinute: 20 * 60, price: 100000 }],
        new Date(),
      ),
    ).rejects.toSatisfy((err: unknown) => {
      const e = err as { code: string; meta?: { gapStart?: number; gapEnd?: number } };
      expect(e.code).toBe('PRICING_GAP');
      expect(e.meta?.gapStart).toBe(20 * 60);
      expect(e.meta?.gapEnd).toBe(22 * 60);
      return true;
    });
  });

  it('AC-VEN-06-4: booking đã tạo priceSnapshot=120000, đổi giá khung đó thành 150000 -> booking cũ vẫn giữ 120000', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const booking = await prisma.booking.create({
      data: {
        courtId: court.id,
        startAt: new Date(),
        endAt: new Date(Date.now() + 3600_000),
        source: 'internal',
        status: 'confirmed',
        priceSnapshot: 120000n,
        guestName: 'A',
        guestContact: '0900',
      },
    });

    await setOperatingHours(provider.userId, court.id, WEEKDAY, 0, 24 * 60);
    await savePricingRules(
      provider.userId,
      court.id,
      [{ weekday: WEEKDAY, startMinute: 0, endMinute: 24 * 60, price: 150000 }],
      new Date(),
    );

    const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchanged.priceSnapshot).toBe(120000n);
  });

  it('AC-VEN-06-5: booking 18h-20h bắc qua hai khung 100.000/h và 150.000/h -> tổng 250.000', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    await setOperatingHours(provider.userId, court.id, WEEKDAY, 6 * 60, 22 * 60);
    await savePricingRules(
      provider.userId,
      court.id,
      [
        { weekday: WEEKDAY, startMinute: 6 * 60, endMinute: 19 * 60, price: 100000 },
        { weekday: WEEKDAY, startMinute: 19 * 60, endMinute: 22 * 60, price: 150000 },
      ],
      new Date(Date.now() - 1000),
    );

    // Neo vào đúng WEEKDAY (Thứ Tư) để không phụ thuộc ngày chạy test.
    const base = new Date();
    const diff = (WEEKDAY - base.getUTCDay() + 7) % 7 || 7;
    base.setUTCDate(base.getUTCDate() + diff);
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 18, 0, 0));
    const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 20, 0, 0));

    const total = await calculateBookingPrice(court.id, start, end);
    expect(total).toBe(250000n);
  });
});
