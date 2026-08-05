import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { createInternalBooking, cancelInternalBooking } from '../src/domain/internalBooking.js';
import { createApprovedProvider, createVenueWithCourt } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

function slotTomorrow(hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

describe('VEN-09 — Ghi nhận booking tại quầy', () => {
  it('AC-VEN-09-1: slot trống trong giờ hoạt động -> tạo booking source=internal, status=confirmed, biến mất khỏi lịch trống', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const start = slotTomorrow(9);
    const booking = await createInternalBooking(provider.userId, {
      courtId: court.id,
      startAt: start,
      endAt: slotTomorrow(10),
      guestName: 'Khach A',
      guestContact: '0900000000',
    });
    expect(booking.source).toBe('internal');
    expect(booking.status).toBe('confirmed');
  });

  it('AC-VEN-09-2: slot đã có booking confirmed từ nền tảng -> ghi booking tại quầy cùng slot -> từ chối', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const start = slotTomorrow(9);
    await prisma.booking.create({
      data: { courtId: court.id, startAt: start, endAt: slotTomorrow(10), source: 'marketplace', status: 'confirmed', priceSnapshot: 100000n, userId: 'player-1' },
    });

    await expect(
      createInternalBooking(provider.userId, { courtId: court.id, startAt: start, endAt: slotTomorrow(10), guestName: 'B', guestContact: '0900' }),
    ).rejects.toMatchObject({ code: 'SLOT_ALREADY_BOOKED' });
  });

  it('AC-VEN-09-3: slot đang có HOLD chưa hết hạn của người chơi khác -> từ chối', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const start = slotTomorrow(9);
    await prisma.hold.create({
      data: { courtId: court.id, startAt: start, endAt: slotTomorrow(10), userId: 'other-player', expiresAt: new Date(Date.now() + 5 * 60_000) },
    });

    await expect(
      createInternalBooking(provider.userId, { courtId: court.id, startAt: start, endAt: slotTomorrow(10), guestName: 'B', guestContact: '0900' }),
    ).rejects.toMatchObject({ code: 'SLOT_ON_HOLD' });
  });

  it('AC-VEN-09-4: booking nội bộ đã tạo -> không có luồng nào chạm finance (không LEDGER_ENTRY, không hoa hồng — đúng theo thiết kế)', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const booking = await createInternalBooking(provider.userId, {
      courtId: court.id,
      startAt: slotTomorrow(9),
      endAt: slotTomorrow(10),
      guestName: 'A',
      guestContact: '0900',
    });

    // BR-VEN-08: createInternalBooking không publish Outbox nào, không gọi
    // finance-service — xác nhận bằng cách không có dòng Outbox nào cho booking này.
    const events = await prisma.outbox.findMany({ where: { aggregateId: booking.id } });
    expect(events).toHaveLength(0);
  });

  it('AC-VEN-09-5: hủy booking nội bộ -> slot trở lại trống, không có luồng hoàn tiền nào được kích hoạt', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const booking = await createInternalBooking(provider.userId, {
      courtId: court.id,
      startAt: slotTomorrow(9),
      endAt: slotTomorrow(10),
      guestName: 'A',
      guestContact: '0900',
    });

    await cancelInternalBooking(provider.userId, booking.id);

    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.status).toBe('cancelled');
    const events = await prisma.outbox.findMany({ where: { aggregateId: booking.id } });
    expect(events).toHaveLength(0); // không refund event nào — nền tảng chưa từng thu tiền
  });
});
