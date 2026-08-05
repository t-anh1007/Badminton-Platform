import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { setBookingRule, isDurationAllowed } from '../src/domain/bookingRule.js';
import { createApprovedProvider, createVenueWithCourt } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('VEN-07 — Thiết lập quy tắc đặt sân', () => {
  it('AC-VEN-07-1: bước 30, tối thiểu 60, tối đa 180 -> BOK-05 chỉ cho chọn 60/90/120/150/180', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    await setBookingRule(provider.userId, court.id, 30, 60, 180);

    const allowed = [60, 90, 120, 150, 180];
    const disallowed = [45, 200, 61];
    for (const d of allowed) expect(await isDurationAllowed(court.id, d)).toBe(true);
    for (const d of disallowed) expect(await isDurationAllowed(court.id, d)).toBe(false);
  });

  it('AC-VEN-07-2: tối thiểu 90 phút, bước 60 -> từ chối vì tối thiểu không phải bội số của bước', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    await expect(setBookingRule(provider.userId, court.id, 60, 90, 180)).rejects.toMatchObject({
      code: 'MIN_NOT_MULTIPLE_OF_STEP',
    });
  });

  it('AC-VEN-07-3: tối thiểu lớn hơn tối đa -> từ chối', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    await expect(setBookingRule(provider.userId, court.id, 30, 200, 180)).rejects.toMatchObject({
      code: 'MIN_GREATER_THAN_MAX',
    });
  });

  it('AC-VEN-07-4: quy tắc đã lưu, gọi thẳng kiểm tra tạo hold 45 phút -> từ chối (BOK-06 sẽ gọi hàm này khi tạo hold thật ở G3)', async () => {
    const provider = await createApprovedProvider();
    const { court } = await createVenueWithCourt(provider.id);
    await setBookingRule(provider.userId, court.id, 30, 60, 180);
    expect(await isDurationAllowed(court.id, 45)).toBe(false);
  });
});
