import { prisma } from '../lib/prisma.js';
import { DEMO_USER_ID, DEMO_IDS } from '@khoaluantn/shared';

/** Seed dữ liệu đặt sân cho tài khoản demo: 1 NCC đã duyệt + 1 cơ sở + 2 sân con
 * (giờ mở cửa, giá, booking rule) + 3 booking (sắp tới / đã qua / đã hủy).
 * Idempotent theo id cố định. */
async function main(): Promise<void> {
  const now = Date.now();
  const at = (deltaMs: number, hour: number, minute = 0): Date => {
    const d = new Date(now + deltaMs);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const day = 86_400_000;

  await prisma.provider.upsert({
    where: { id: DEMO_IDS.provider },
    create: { id: DEMO_IDS.provider, userId: DEMO_USER_ID, orgName: 'CLB Cầu lông Demo', status: 'approved' },
    update: { orgName: 'CLB Cầu lông Demo', status: 'approved' },
  });

  await prisma.venue.upsert({
    where: { id: DEMO_IDS.venue },
    create: {
      id: DEMO_IDS.venue, providerId: DEMO_IDS.provider, name: 'Nhà thi đấu Demo Courtin',
      lat: 10.762622, lng: 106.660172, address: '123 Đường Demo, Quận 5, TP.HCM',
      amenities: ['Bãi xe', 'Căng tin', 'Phòng thay đồ'], images: [],
    },
    update: { name: 'Nhà thi đấu Demo Courtin', address: '123 Đường Demo, Quận 5, TP.HCM' },
  });

  for (const [courtId, name] of [[DEMO_IDS.courtA, 'Sân 1'], [DEMO_IDS.courtB, 'Sân 2']] as const) {
    await prisma.court.upsert({
      where: { id: courtId },
      create: { id: courtId, venueId: DEMO_IDS.venue, name, active: true },
      update: { name, active: true },
    });
    // Giờ mở cửa 06:00–22:00 mỗi ngày trong tuần.
    for (let weekday = 0; weekday < 7; weekday += 1) {
      await prisma.operatingHour.upsert({
        where: { courtId_weekday: { courtId, weekday } },
        create: { courtId, weekday, openMinute: 360, closeMinute: 1320 },
        update: { openMinute: 360, closeMinute: 1320 },
      });
    }
    await prisma.bookingRule.upsert({
      where: { courtId },
      create: { courtId, stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 180 },
      update: { stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 180 },
    });
    // Giá phẳng 120k/giờ (theo phút step 30 → 60k/slot) cho mọi ngày.
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const existing = await prisma.pricingRule.findFirst({ where: { courtId, weekday, startMinute: 360 } });
      if (!existing) {
        await prisma.pricingRule.create({
          data: { courtId, weekday, startMinute: 360, endMinute: 1320, price: 60_000n, effectiveFrom: new Date(now - 30 * day) },
        });
      }
    }
  }

  // Bookings: sắp tới (confirmed, tương lai), đã qua (completed), đã hủy (cancelled).
  await prisma.booking.upsert({
    where: { id: DEMO_IDS.bookingUpcoming },
    create: {
      id: DEMO_IDS.bookingUpcoming, courtId: DEMO_IDS.courtA, userId: DEMO_USER_ID,
      startAt: at(2 * day, 18), endAt: at(2 * day, 19, 30), source: 'marketplace',
      status: 'confirmed', priceSnapshot: 120_000n,
    },
    update: { status: 'confirmed', startAt: at(2 * day, 18), endAt: at(2 * day, 19, 30) },
  });
  await prisma.booking.upsert({
    where: { id: DEMO_IDS.bookingPast },
    create: {
      id: DEMO_IDS.bookingPast, courtId: DEMO_IDS.courtA, userId: DEMO_USER_ID,
      startAt: at(-7 * day, 19), endAt: at(-7 * day, 20, 30), source: 'marketplace',
      status: 'completed', priceSnapshot: 100_000n,
    },
    update: { status: 'completed' },
  });
  await prisma.booking.upsert({
    where: { id: DEMO_IDS.bookingCancelled },
    create: {
      id: DEMO_IDS.bookingCancelled, courtId: DEMO_IDS.courtB, userId: DEMO_USER_ID,
      startAt: at(-3 * day, 20), endAt: at(-3 * day, 21, 30), source: 'marketplace',
      status: 'cancelled', cancellationReason: 'self', cancellationRefundPercent: 100, priceSnapshot: 80_000n,
    },
    update: { status: 'cancelled', cancellationReason: 'self', cancellationRefundPercent: 100 },
  });

  // Booking nền cho kèo (matchmaking cần context để hiện trên trang Tìm kèo).
  await prisma.booking.upsert({
    where: { id: DEMO_IDS.matchCompletedBooking },
    create: {
      id: DEMO_IDS.matchCompletedBooking, courtId: DEMO_IDS.courtB, userId: null,
      startAt: at(-7 * day, 8), endAt: at(-7 * day, 9, 30), source: 'marketplace',
      status: 'completed', priceSnapshot: 240_000n,
    },
    update: { status: 'completed' },
  });
  await prisma.booking.upsert({
    where: { id: DEMO_IDS.matchOpenBooking },
    create: {
      id: DEMO_IDS.matchOpenBooking, courtId: DEMO_IDS.courtB, userId: null,
      startAt: at(5 * day, 8), endAt: at(5 * day, 9, 30), source: 'marketplace',
      status: 'confirmed', priceSnapshot: 240_000n,
    },
    update: { status: 'confirmed', startAt: at(5 * day, 8), endAt: at(5 * day, 9, 30) },
  });

  console.log('[seed:demo][venue-booking] provider + venue + 2 courts + 5 bookings ready');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => { console.error('[seed:demo][venue-booking]', err); await prisma.$disconnect(); process.exit(1); });
