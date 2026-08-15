import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { createApp } from '../src/app.js';
import { selectSlot } from '../src/domain/slotSelection.js';
import { createApprovedProvider, createVenueWithCourt, signTestAccessToken, fakeUserId } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

const app = createApp();

function tomorrowAt(hour: number, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

async function setupCourtWithRule(providerId: string) {
  const { court } = await createVenueWithCourt(providerId);
  const weekday = tomorrowAt(0).getUTCDay();
  await prisma.operatingHour.create({ data: { courtId: court.id, weekday, openMinute: 0, closeMinute: 24 * 60 } });
  await prisma.bookingRule.create({ data: { courtId: court.id, stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 180 } });
  return court;
}

describe('BOK-05 — Chọn slot và thời lượng đặt sân', () => {
  it('AC-BOK-05-1: bước 30, tối thiểu 60, tối đa 180 -> chọn 90 phút -> chấp nhận, hiển thị tổng tiền', async () => {
    const provider = await createApprovedProvider();
    const court = await setupCourtWithRule(provider.id);
    const weekday = tomorrowAt(0).getUTCDay();
    await prisma.pricingRule.create({
      data: { courtId: court.id, weekday, startMinute: 0, endMinute: 24 * 60, price: 100000n, effectiveFrom: new Date(Date.now() - 1000) },
    });

    const result = await selectSlot(court.id, tomorrowAt(9), 90);
    expect(result.durationMinutes).toBe(90);
    expect(result.totalPrice).toBe(150000n);
  });

  it('AC-BOK-05-2: cùng sân, gọi thẳng API với thời lượng 45 phút -> từ chối', async () => {
    const provider = await createApprovedProvider();
    const court = await setupCourtWithRule(provider.id);
    const userId = fakeUserId();
    const token = signTestAccessToken(userId, ['player']);

    const res = await request(app)
      .post(`/courts/${court.id}/select-slot`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startAt: tomorrowAt(9).toISOString(), durationMinutes: 45 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DURATION');
  });

  it('AC-BOK-05-3: booking 18h-20h bắc qua khung 100k/giờ và 150k/giờ -> tổng hiển thị 250k', async () => {
    const provider = await createApprovedProvider();
    const court = await setupCourtWithRule(provider.id);
    const weekday = tomorrowAt(0).getUTCDay();
    await prisma.pricingRule.create({
      data: { courtId: court.id, weekday, startMinute: 0, endMinute: 19 * 60, price: 100000n, effectiveFrom: new Date(Date.now() - 1000) },
    });
    await prisma.pricingRule.create({
      data: { courtId: court.id, weekday, startMinute: 19 * 60, endMinute: 24 * 60, price: 150000n, effectiveFrom: new Date(Date.now() - 1000) },
    });

    const result = await selectSlot(court.id, tomorrowAt(18), 120);
    expect(result.totalPrice).toBe(250000n);
  });

  it('AC-BOK-05-4: khoảng chọn 19h-21h nhưng 20h-20h30 đã có booking -> từ chối, chỉ ra đoạn bị vướng', async () => {
    const provider = await createApprovedProvider();
    const court = await setupCourtWithRule(provider.id);
    const bookedStart = tomorrowAt(20);
    await prisma.booking.create({
      data: { courtId: court.id, startAt: bookedStart, endAt: tomorrowAt(20, 30), source: 'internal', status: 'confirmed', priceSnapshot: 50000n, guestName: 'A', guestContact: '0900' },
    });

    await expect(selectSlot(court.id, tomorrowAt(19), 120)).rejects.toMatchObject({ code: 'SLOT_CONFLICT' });
  });

  it('AC-BOK-05-5: khách chưa đăng nhập chọn một khung giờ -> điều hướng đăng nhập (API từ chối 401)', async () => {
    const provider = await createApprovedProvider();
    const court = await setupCourtWithRule(provider.id);

    const res = await request(app)
      .post(`/courts/${court.id}/select-slot`)
      .send({ startAt: tomorrowAt(9).toISOString(), durationMinutes: 90 });

    expect(res.status).toBe(401);
  });
});
