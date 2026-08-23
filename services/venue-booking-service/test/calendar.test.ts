import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { getUnifiedCalendar } from '../src/domain/calendar.js';
import { createApprovedProvider } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

async function createVenueWithNCourts(providerId: string, n: number) {
  const venue = await prisma.venue.create({
    data: { providerId, name: 'V', lat: 1, lng: 1, address: 'A' },
  });
  const courts = [];
  for (let i = 0; i < n; i++) {
    courts.push(await prisma.court.create({ data: { venueId: venue.id, name: `San ${i + 1}`, active: true } }));
  }
  return { venue, courts };
}

describe('VEN-08 — Quản lý lịch sân hợp nhất', () => {
  it('AC-VEN-08-1: cơ sở có 3 sân con -> mở lịch hợp nhất, cả 3 sân hiển thị song song', async () => {
    const provider = await createApprovedProvider();
    const { venue } = await createVenueWithNCourts(provider.id, 3);
    const result = await getUnifiedCalendar(provider.userId, venue.id, new Date());
    expect(result.courts).toHaveLength(3);
  });

  it('AC-VEN-08-2: một slot booking từ nền tảng, một slot booking ghi tại quầy -> cả hai hiện đã bận, phân biệt nguồn', async () => {
    const provider = await createApprovedProvider();
    const { venue, courts } = await createVenueWithNCourts(provider.id, 2);
    const day = new Date();
    await prisma.booking.create({
      data: { courtId: courts[0]!.id, startAt: day, endAt: new Date(day.getTime() + 3600_000), source: 'marketplace', status: 'confirmed', priceSnapshot: 100000n, userId: '11111111-1111-4111-8111-111111111111' },
    });
    await prisma.booking.create({
      data: { courtId: courts[1]!.id, startAt: day, endAt: new Date(day.getTime() + 3600_000), source: 'internal', status: 'confirmed', priceSnapshot: 100000n, guestName: 'Khach', guestContact: '0900' },
    });

    const result = await getUnifiedCalendar(provider.userId, venue.id, day, {
      getPublicDisplayNames: async () => [{ userId: '11111111-1111-4111-8111-111111111111', displayName: 'Khách demo' }],
    });
    const bookingEntries = result.entries.filter((e) => e.kind === 'booking');
    expect(bookingEntries).toHaveLength(2);
    expect(bookingEntries.map((e) => e.source).sort()).toEqual(['internal', 'marketplace']);
    expect(bookingEntries.find((e) => e.source === 'marketplace')?.customerLabel).toBe('Khách demo');
  });

  it('AC-VEN-08-3: slot đang HOLD chưa hết hạn -> hiển thị đang giữ chỗ, khác đã xác nhận', async () => {
    const provider = await createApprovedProvider();
    const { venue, courts } = await createVenueWithNCourts(provider.id, 1);
    const day = new Date();
    await prisma.hold.create({
      data: { courtId: courts[0]!.id, startAt: day, endAt: new Date(day.getTime() + 3600_000), userId: 'p1', expiresAt: new Date(Date.now() + 5 * 60_000) },
    });

    const result = await getUnifiedCalendar(provider.userId, venue.id, day);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.kind).toBe('hold');
  });

  it('AC-VEN-08-4: ngày nằm trong danh sách đóng cửa -> toàn bộ khung giờ hiển thị đóng cửa, không phải trống', async () => {
    const provider = await createApprovedProvider();
    const { venue, courts } = await createVenueWithNCourts(provider.id, 1);
    const day = new Date();
    const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    await prisma.closure.create({ data: { courtId: courts[0]!.id, date: dayStart } });

    const result = await getUnifiedCalendar(provider.userId, venue.id, day);
    expect(result.courts.find((c) => c.courtId === courts[0]!.id)!.closedAllDay).toBe(true);
  });

  it('AC-VEN-08-5: NCC A gọi API xem lịch của cơ sở thuộc NCC B -> từ chối', async () => {
    const providerA = await createApprovedProvider();
    const providerB = await createApprovedProvider();
    const { venue: venueB } = await createVenueWithNCourts(providerB.id, 1);

    await expect(getUnifiedCalendar(providerA.userId, venueB.id, new Date())).rejects.toMatchObject({
      code: 'FORBIDDEN_NOT_OWNER',
    });
  });
});
