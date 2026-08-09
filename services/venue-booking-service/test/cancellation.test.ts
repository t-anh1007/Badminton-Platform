import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { createApp } from '../src/app.js';
import { CANCELLATION_POLICY } from '../src/domain/cancellationPolicy.js';
import { createApprovedProvider, createVenueWithCourt, fakeUserId, signTestAccessToken } from './helpers.js';
import { createHold } from '../src/domain/hold.js';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function setupConfirmedBooking(hoursUntilStart: number, price = 200000n) {
  const playerId = fakeUserId();
  const providerUserId = fakeUserId();
  const provider = await createApprovedProvider(providerUserId);
  const { venue, court } = await createVenueWithCourt(provider.id);
  const replacementCourt = await prisma.court.create({
    data: { venueId: venue.id, name: `San thay the ${fakeUserId()}`, active: true },
  });
  for (let weekday = 0; weekday <= 6; weekday++) {
    await prisma.operatingHour.createMany({
      data: [
        { courtId: court.id, weekday, openMinute: 0, closeMinute: 1440 },
        { courtId: replacementCourt.id, weekday, openMinute: 0, closeMinute: 1440 },
      ],
    });
  }
  const startAt = new Date(Date.now() + hoursUntilStart * 3_600_000);
  const booking = await prisma.booking.create({
    data: {
      courtId: court.id,
      startAt,
      endAt: new Date(startAt.getTime() + 3_600_000),
      userId: playerId,
      source: 'marketplace',
      status: 'confirmed',
      priceSnapshot: price,
      policySnapshot: CANCELLATION_POLICY,
    },
  });
  return { playerId, providerUserId, provider, venue, court, replacementCourt, booking };
}

describe('BOK-09 — Người chơi hủy booking', () => {
  for (const [hours, refundPercent] of [
    [30, 100],
    [10, 50],
    [2, 0],
  ] as const) {
    it(`AC-BOK-09-1..3: hủy trước ${hours}h phát đúng refundPercent=${refundPercent}`, async () => {
      const { playerId, booking } = await setupConfirmedBooking(hours);
      const token = signTestAccessToken(playerId, ['player']);

      const response = await request(app)
        .post(`/players/me/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'cancelled', refundPercent });
      const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(stored.status).toBe('cancelled');
      expect(stored.cancellationReason).toBe('self');
      const events = await prisma.outbox.findMany({
        where: { aggregateId: booking.id, eventType: 'BookingCancelled' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.payload).toMatchObject({
        bookingId: booking.id,
        userId: playerId,
        gross: '200000',
        refundPercent,
        reason: 'self',
      });
    });
  }

  it('AC-BOK-09-4: booking hủy không còn chặn slot', async () => {
    const { playerId, booking } = await setupConfirmedBooking(30);
    const token = signTestAccessToken(playerId, ['player']);
    await request(app).post(`/players/me/bookings/${booking.id}/cancel`).set('Authorization', `Bearer ${token}`).send();

    const blocking = await prisma.booking.findFirst({
      where: { courtId: booking.courtId, status: 'confirmed', startAt: booking.startAt, endAt: booking.endAt },
    });
    expect(blocking).toBeNull();
  });

  it('AC-BOK-09-5: không cho hủy khi ca đã bắt đầu', async () => {
    const { playerId, booking } = await setupConfirmedBooking(-1);
    const token = signTestAccessToken(playerId, ['player']);
    const response = await request(app)
      .post(`/players/me/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('BOOKING_ALREADY_STARTED');
  });

  it('AC-BOK-09-6: dùng policySnapshot của booking thay vì chính sách hiện tại', async () => {
    const { playerId, booking } = await setupConfirmedBooking(10);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { policySnapshot: { tiers: [{ minHoursBeforeStart: 0, refundPercent: 25 }] } },
    });
    const token = signTestAccessToken(playerId, ['player']);
    const response = await request(app)
      .post(`/players/me/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(response.body.refundPercent).toBe(25);
  });

  it('AC-BOK-09-7: bấm hủy hai lần chỉ phát một BookingCancelled', async () => {
    const { playerId, booking } = await setupConfirmedBooking(30);
    const token = signTestAccessToken(playerId, ['player']);
    const first = await request(app)
      .post(`/players/me/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    const second = await request(app)
      .post(`/players/me/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await prisma.outbox.count({ where: { aggregateId: booking.id, eventType: 'BookingCancelled' } })).toBe(1);
  });
});

describe('BOK-10 — Phía sân đổi sân con hoặc hủy', () => {
  it('AC-BOK-10-1/6: đổi sang sân trống cùng cơ sở, giữ giờ/giá/status và chi tiết có ghi chú', async () => {
    const { playerId, providerUserId, booking, replacementCourt } = await setupConfirmedBooking(30);
    const token = signTestAccessToken(providerUserId, ['player', 'provider']);
    const response = await request(app)
      .post(`/providers/bookings/${booking.id}/change-court`)
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: replacementCourt.id });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      courtId: replacementCourt.id,
      priceSnapshot: '200000',
      status: 'confirmed',
    });
    expect(new Date(response.body.startAt).toISOString()).toBe(booking.startAt.toISOString());

    const detailToken = signTestAccessToken(playerId, ['player']);
    const detail = await request(app)
      .get(`/players/me/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${detailToken}`);
    expect(detail.body.booking.courtId).toBe(replacementCourt.id);
    expect(detail.body.courtChangeNote).toBe('Booking đã được phía sân chuyển sang sân con khác.');
  });

  it('AC-BOK-10-2: không liệt kê sân con đang bận', async () => {
    const { providerUserId, booking, replacementCourt } = await setupConfirmedBooking(30);
    await prisma.booking.create({
      data: {
        courtId: replacementCourt.id,
        startAt: booking.startAt,
        endAt: booking.endAt,
        userId: fakeUserId(),
        source: 'marketplace',
        status: 'confirmed',
        priceSnapshot: 100000n,
      },
    });
    const token = signTestAccessToken(providerUserId, ['player', 'provider']);
    const response = await request(app)
      .get(`/providers/bookings/${booking.id}/replacement-courts`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.courts).toEqual([]);
  });

  it('AC-BOK-10-2: không liệt kê sân con đóng cửa hoặc ngoài giờ hoạt động', async () => {
    const { providerUserId, booking, replacementCourt } = await setupConfirmedBooking(30);
    const dayStart = new Date(
      Date.UTC(booking.startAt.getUTCFullYear(), booking.startAt.getUTCMonth(), booking.startAt.getUTCDate()),
    );
    await prisma.closure.create({ data: { courtId: replacementCourt.id, date: dayStart, reason: 'Bảo trì' } });
    const token = signTestAccessToken(providerUserId, ['player', 'provider']);
    const closed = await request(app)
      .get(`/providers/bookings/${booking.id}/replacement-courts`)
      .set('Authorization', `Bearer ${token}`);
    expect(closed.body.courts).toEqual([]);

    await prisma.closure.delete({ where: { courtId_date: { courtId: replacementCourt.id, date: dayStart } } });
    await prisma.operatingHour.update({
      where: { courtId_weekday: { courtId: replacementCourt.id, weekday: booking.startAt.getUTCDay() } },
      data: { openMinute: 0, closeMinute: 1 },
    });
    const outsideHours = await request(app)
      .get(`/providers/bookings/${booking.id}/replacement-courts`)
      .set('Authorization', `Bearer ${token}`);
    expect(outsideHours.body.courts).toEqual([]);
  });

  it('AC-BOK-10-3: phía sân hủy phát sự kiện hoàn 100%', async () => {
    const { providerUserId, booking } = await setupConfirmedBooking(2);
    const token = signTestAccessToken(providerUserId, ['player', 'provider']);
    const response = await request(app)
      .post(`/providers/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Sân gặp sự cố' });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('cancelled');
    const event = await prisma.outbox.findFirstOrThrow({
      where: { aggregateId: booking.id, eventType: 'BookingCancelled' },
    });
    expect(event.payload).toMatchObject({
      refundPercent: 100,
      reason: 'provider_fault',
      cancellationNote: 'Sân gặp sự cố',
    });
  });

  it('AC-BOK-10-4: phía sân hủy không có lý do bị từ chối', async () => {
    const { providerUserId, booking } = await setupConfirmedBooking(30);
    const token = signTestAccessToken(providerUserId, ['player', 'provider']);
    const response = await request(app)
      .post(`/providers/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '   ' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('AC-BOK-10-5: provider khác không được đổi booking', async () => {
    const { booking, replacementCourt } = await setupConfirmedBooking(30);
    const outsider = await createApprovedProvider();
    const token = signTestAccessToken(outsider.userId, ['player', 'provider']);
    const response = await request(app)
      .post(`/providers/bookings/${booking.id}/change-court`)
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId: replacementCourt.id });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN_NOT_OWNER');
  });

  it('BOK-10 actor Admin: hủy thay nền tảng phát platform_admin và hoàn 100%', async () => {
    const { booking } = await setupConfirmedBooking(30);
    const token = signTestAccessToken(fakeUserId(), ['admin']);
    const response = await request(app)
      .post(`/admin/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Vi phạm nghiêm trọng' });
    expect(response.status).toBe(200);
    const event = await prisma.outbox.findFirstOrThrow({
      where: { aggregateId: booking.id, eventType: 'BookingCancelled' },
    });
    expect(event.payload).toMatchObject({ reason: 'platform_admin', refundPercent: 100 });
  });

  it('race đổi sân và tạo HOLD trên sân đích: không bao giờ cả hai cùng thành công', async () => {
    for (let trial = 0; trial < 10; trial++) {
      const { providerUserId, booking, replacementCourt } = await setupConfirmedBooking(30 + trial);
      const token = signTestAccessToken(providerUserId, ['player', 'provider']);
      const [change, hold] = await Promise.allSettled([
        request(app)
          .post(`/providers/bookings/${booking.id}/change-court`)
          .set('Authorization', `Bearer ${token}`)
          .send({ courtId: replacementCourt.id })
          .then((response) => {
            if (response.status !== 200) throw new Error(`change:${response.status}`);
            return response;
          }),
        createHold(fakeUserId(), { courtId: replacementCourt.id, startAt: booking.startAt, endAt: booking.endAt }),
      ]);
      expect([change, hold].filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    }
  }, 30000);
});
