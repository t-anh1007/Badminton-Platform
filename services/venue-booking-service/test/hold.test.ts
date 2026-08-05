import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { createHold, reapExpiredHolds } from '../src/domain/hold.js';
import { isRangeFree } from '../src/domain/slotAvailability.js';
import { createApprovedProvider, createVenueWithCourt, fakeUserId } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

function tomorrowAt(hour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

describe('BOK-06 — Giữ slot trong 10 phút', () => {
  it('AC-BOK-06-1: slot khả dụng -> tạo HOLD với expiresAt đúng 10 phút sau, slot biến mất khỏi lịch trống của người khác', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const start = tomorrowAt(9);
    const end = tomorrowAt(10);
    const before = Date.now();

    const hold = await createHold(fakeUserId(), { courtId: court.id, startAt: start, endAt: end });

    const deltaMs = hold.expiresAt.getTime() - before;
    expect(deltaMs).toBeGreaterThan(9 * 60_000);
    expect(deltaMs).toBeLessThanOrEqual(10 * 60_000 + 2000); // dung sai nhỏ cho thời gian chạy test

    expect(await isRangeFree(court.id, start, end)).toBe(false);
  });

  it('AC-BOK-06-2 [BẮT BUỘC — kiểm thử đồng thời]: 20 yêu cầu giữ CÙNG một slot đồng thời -> đúng MỘT hold được tạo, 19 còn lại nhận SLOT_ON_HOLD', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const start = tomorrowAt(14);
    const end = tomorrowAt(15);

    const N = 20;
    const results = await Promise.allSettled(
      Array.from({ length: N }, () => createHold(fakeUserId(), { courtId: court.id, startAt: start, endAt: end })),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(N - 1);
    for (const f of failed as PromiseRejectedResult[]) {
      expect((f.reason as { code: string }).code).toBe('SLOT_ON_HOLD');
    }

    // Xác nhận trực tiếp trong CSDL: đúng 1 dòng Hold cho slot này — bằng
    // chứng ràng buộc loại trừ ở tầng CSDL hoạt động thật, không chỉ dựa vào
    // đếm promise đã "thắng" ở tầng ứng dụng.
    const holdsInDb = await prisma.hold.findMany({
      where: { courtId: court.id, startAt: start, endAt: end },
    });
    expect(holdsInDb).toHaveLength(1);
  });

  it('AC-BOK-06-3: hold đã quá 10 phút và chưa thanh toán -> tác vụ nền chạy -> slot trở lại khả dụng', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const start = tomorrowAt(11);
    const end = tomorrowAt(12);
    const userId = fakeUserId();
    await prisma.hold.create({
      data: { courtId: court.id, startAt: start, endAt: end, userId, expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await isRangeFree(court.id, start, end)).toBe(true); // đã hết hạn, tự do ngay cả trước khi reap chạy

    const reaped = await reapExpiredHolds(); // mô phỏng tác vụ nền
    expect(reaped).toBeGreaterThanOrEqual(1);
    const remaining = await prisma.hold.findMany({ where: { courtId: court.id, startAt: start, endAt: end } });
    expect(remaining).toHaveLength(0);
  });

  it('AC-BOK-06-4: đang có hold ở slot A, giữ chỗ slot B -> hold A giải phóng, hold B tạo trong cùng giao dịch, tối đa một hold/người', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const userId = fakeUserId();
    const slotA = { start: tomorrowAt(9), end: tomorrowAt(10) };
    const slotB = { start: tomorrowAt(13), end: tomorrowAt(14) };

    await createHold(userId, { courtId: court.id, startAt: slotA.start, endAt: slotA.end });
    expect(await isRangeFree(court.id, slotA.start, slotA.end)).toBe(false);

    await createHold(userId, { courtId: court.id, startAt: slotB.start, endAt: slotB.end });

    expect(await isRangeFree(court.id, slotA.start, slotA.end)).toBe(true); // A giải phóng ngay
    const userHolds = await prisma.hold.findMany({ where: { userId } });
    expect(userHolds).toHaveLength(1); // tối đa một hold
    expect(userHolds[0]!.startAt.getTime()).toBe(slotB.start.getTime());
  });

  it('AC-BOK-06-5: slot đã có booking confirmed -> gọi thẳng API tạo hold cho slot đó -> từ chối', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    const start = tomorrowAt(16);
    const end = tomorrowAt(17);
    await prisma.booking.create({
      data: { courtId: court.id, startAt: start, endAt: end, source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'A', guestContact: '0900' },
    });

    await expect(createHold(fakeUserId(), { courtId: court.id, startAt: start, endAt: end })).rejects.toMatchObject({
      code: 'SLOT_ALREADY_BOOKED',
    });
  });
});
