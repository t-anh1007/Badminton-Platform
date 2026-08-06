import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { createHold } from '../src/domain/hold.js';
import { createBookingFromHold, reapExpiredHeldBookings, listMyBookings, getMyBookingDetail } from '../src/domain/booking.js';
import { handlePaymentCompleted } from '../src/lib/eventConsumer.js';
import { createApprovedProvider, createVenueWithCourt, makeCourtSearchable, fakeUserId } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

function tomorrowAt(hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function setupHeldBooking(price = 200000) {
  const userId = fakeUserId();
  const provider = await createApprovedProvider();
  const { court } = await makeCourtSearchable(provider.id, undefined, price);
  const start = tomorrowAt(9);
  const end = tomorrowAt(10);
  const hold = await createHold(userId, { courtId: court.id, startAt: start, endAt: end });
  const booking = await createBookingFromHold(userId, hold.id);
  return { userId, provider, court, booking };
}

describe('BOK-07 — Tạo booking đặt sân', () => {
  it('AC-BOK-07-1: hold còn hạn, PaymentCompleted về -> booking confirmed, hold bị xóa Ở BƯỚC XÁC NHẬN (không phải lúc tạo booking), BookingConfirmed phát đúng một lần', async () => {
    const { booking } = await setupHeldBooking();
    // G4-fix: hold VẪN CÒN sau khi tạo booking (giữ tới bước xác nhận, chống
    // race hai người trả cùng slot). EXCLUDE constraint dùng hold này chặn
    // người thứ hai suốt cửa sổ trả tiền.
    expect(await prisma.hold.findMany({ where: { courtId: booking.courtId } })).toHaveLength(1);

    await handlePaymentCompleted(randomUUID(), { bookingId: booking.id });

    const confirmed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(confirmed.status).toBe('confirmed');
    // Hold bị xóa Ở BƯỚC XÁC NHẬN (spec BOK-07 bước 5).
    expect(await prisma.hold.findMany({ where: { courtId: booking.courtId } })).toHaveLength(0);
    const outboxRows = await prisma.outbox.findMany({ where: { aggregateId: booking.id, eventType: 'BookingConfirmed' } });
    expect(outboxRows).toHaveLength(1);
  });

  it('AC-BOK-07-2: hold đã hết hạn, PaymentCompleted về cho booking đó -> cancelled, không confirmed, phát PaymentTooLate để finance ghi có ví cá nhân', async () => {
    const { booking } = await setupHeldBooking();
    await prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });

    await handlePaymentCompleted(randomUUID(), { bookingId: booking.id });

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('cancelled');
    const tooLateRows = await prisma.outbox.findMany({ where: { aggregateId: booking.id, eventType: 'PaymentTooLate' } });
    expect(tooLateRows).toHaveLength(1);
    expect((tooLateRows[0]!.payload as { amount: string }).amount).toBe(booking.priceSnapshot.toString());
    const confirmedRows = await prisma.outbox.findMany({ where: { aggregateId: booking.id, eventType: 'BookingConfirmed' } });
    expect(confirmedRows).toHaveLength(0);
  });

  it('AC-BOK-07-3: booking vừa confirmed giá 250k, chủ sân đổi biểu giá ngay sau đó -> priceSnapshot vẫn 250k', async () => {
    const { booking, court } = await setupHeldBooking(250000);
    expect(booking.priceSnapshot).toBe(250000n);

    await prisma.pricingRule.updateMany({ where: { courtId: court.id }, data: { price: 999000n } });

    const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchanged.priceSnapshot).toBe(250000n);
  });

  it('AC-BOK-07-4: PaymentCompleted bị phát lại hai lần (cùng eventId) -> chỉ chuyển trạng thái một lần, không sinh BookingConfirmed thứ hai', async () => {
    const { booking } = await setupHeldBooking();
    const eventId = randomUUID();

    await handlePaymentCompleted(eventId, { bookingId: booking.id });
    await handlePaymentCompleted(eventId, { bookingId: booking.id }); // redeliver

    const confirmed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(confirmed.status).toBe('confirmed');
    const outboxRows = await prisma.outbox.findMany({ where: { aggregateId: booking.id, eventType: 'BookingConfirmed' } });
    expect(outboxRows).toHaveLength(1);
  });

  it('AC-BOK-07-5: người chơi không thanh toán tới khi hold hết hạn -> tác vụ nền chuyển cancelled, slot khả dụng lại', async () => {
    const { booking, court } = await setupHeldBooking();
    await prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });

    const reaped = await reapExpiredHeldBookings();
    expect(reaped).toBeGreaterThanOrEqual(1);

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe('cancelled');

    const conflict = await prisma.booking.findFirst({
      where: { courtId: court.id, status: 'confirmed', startAt: booking.startAt, endAt: booking.endAt },
    });
    expect(conflict).toBeNull(); // không còn gì chặn slot
  });
});

describe('BOK-08 — Xem chi tiết và lịch sử booking', () => {
  it('AC-BOK-08-1: 2 booking sắp tới và 3 booking đã qua -> cả 5 hiển thị đúng nhóm', async () => {
    const userId = fakeUserId();
    const provider = await createApprovedProvider();
    const { court } = await makeCourtSearchable(provider.id);

    for (let i = 0; i < 2; i++) {
      const start = new Date(Date.now() + (i + 1) * 24 * 3600_000);
      await prisma.booking.create({
        data: { courtId: court.id, startAt: start, endAt: new Date(start.getTime() + 3600_000), userId, source: 'marketplace', status: 'confirmed', priceSnapshot: 100000n },
      });
    }
    for (let i = 0; i < 3; i++) {
      const start = new Date(Date.now() - (i + 1) * 24 * 3600_000);
      await prisma.booking.create({
        data: { courtId: court.id, startAt: start, endAt: new Date(start.getTime() + 3600_000), userId, source: 'marketplace', status: 'completed', priceSnapshot: 100000n },
      });
    }

    const { upcoming, past } = await listMyBookings(userId);
    expect(upcoming).toHaveLength(2);
    expect(past).toHaveLength(3);
  });

  it('AC-BOK-08-2: booking bắt đầu sau 30 giờ nữa -> mức hoàn dự kiến 100%', async () => {
    const userId = fakeUserId();
    const provider = await createApprovedProvider();
    const { court } = await makeCourtSearchable(provider.id);
    const start = new Date(Date.now() + 30 * 3600_000);
    const booking = await prisma.booking.create({
      data: { courtId: court.id, startAt: start, endAt: new Date(start.getTime() + 3600_000), userId, source: 'marketplace', status: 'confirmed', priceSnapshot: 100000n },
    });

    const detail = await getMyBookingDetail(userId, booking.id);
    expect(detail.expectedRefundPercent).toBe(100);
  });

  it('AC-BOK-08-3: booking bắt đầu sau 10 giờ nữa -> mức hoàn dự kiến 50%', async () => {
    const userId = fakeUserId();
    const provider = await createApprovedProvider();
    const { court } = await makeCourtSearchable(provider.id);
    const start = new Date(Date.now() + 10 * 3600_000);
    const booking = await prisma.booking.create({
      data: { courtId: court.id, startAt: start, endAt: new Date(start.getTime() + 3600_000), userId, source: 'marketplace', status: 'confirmed', priceSnapshot: 100000n },
    });

    const detail = await getMyBookingDetail(userId, booking.id);
    expect(detail.expectedRefundPercent).toBe(50);
  });

  it('AC-BOK-08-4: người chơi A gọi API xem booking của người chơi B -> từ chối', async () => {
    const ownerId = fakeUserId();
    const otherId = fakeUserId();
    const provider = await createApprovedProvider();
    const { court } = await makeCourtSearchable(provider.id);
    const start = new Date(Date.now() + 30 * 3600_000);
    const booking = await prisma.booking.create({
      data: { courtId: court.id, startAt: start, endAt: new Date(start.getTime() + 3600_000), userId: ownerId, source: 'marketplace', status: 'confirmed', priceSnapshot: 100000n },
    });

    await expect(getMyBookingDetail(otherId, booking.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('AC-BOK-08-5: cơ sở có booking nội bộ do chủ sân ghi -> không xuất hiện trong trang booking của bất kỳ người chơi nào', async () => {
    const userId = fakeUserId();
    const provider = await createApprovedProvider();
    const { court } = await makeCourtSearchable(provider.id);
    const start = new Date(Date.now() + 24 * 3600_000);
    await prisma.booking.create({
      data: { courtId: court.id, startAt: start, endAt: new Date(start.getTime() + 3600_000), source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'A', guestContact: '0900' },
    });

    const { upcoming, past } = await listMyBookings(userId);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(0);
  });
});
