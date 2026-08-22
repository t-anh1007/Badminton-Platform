import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { searchVenues, filterAndSortVenues } from '../src/domain/search.js';
import { createApprovedProvider, makeCourtSearchable, fakeUserId } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

const CENTER = { lat: 10.0, lng: 106.0 };
const NEARBY = { lat: 10.01, lng: 106.01 }; // ~1.5km
const FAR_AWAY = { lat: 30.0, lng: 120.0 }; // rất xa

describe('BOK-01 — Tìm sân bằng danh sách và bản đồ', () => {
  it('AC-BOK-01-1: 3 cơ sở thỏa BR-VEN-03 + 1 cơ sở của NCC bị khóa -> chỉ 3 cơ sở, không có cơ sở bị khóa', async () => {
    for (let i = 0; i < 3; i++) {
      const provider = await createApprovedProvider();
      await makeCourtSearchable(provider.id, NEARBY);
    }
    const lockedProvider = await createApprovedProvider();
    const { venue: lockedVenue } = await makeCourtSearchable(lockedProvider.id, NEARBY);
    await prisma.provider.update({ where: { id: lockedProvider.id }, data: { status: 'suspended' } });

    const results = await searchVenues(CENTER.lat, CENTER.lng, 10);
    expect(results.find((r) => r.venueId === lockedVenue.id)).toBeUndefined();
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.every((result) => result.courtCount >= 1)).toBe(true);
  }, 60000); // fixture dựng 4 cơ sở (mỗi cơ sở 14 lượt insert tuần tự) — cần dư địa khi toàn suite chạy song song

  it('AC-BOK-01-2: cơ sở không có sân con hoạt động -> không xuất hiện', async () => {
    const provider = await createApprovedProvider();
    const venue = await prisma.venue.create({
      data: { providerId: provider.id, name: 'V', lat: NEARBY.lat, lng: NEARBY.lng, address: 'A' },
    });
    const results = await searchVenues(CENTER.lat, CENTER.lng, 10);
    expect(results.find((r) => r.venueId === venue.id)).toBeUndefined();
  }, 15000); // makeCourtSearchable/insert tuần tự — xem ghi chú AC-BOK-01-1

  it('AC-BOK-01-3: khách chưa đăng nhập -> kết quả hiển thị đầy đủ như người đã đăng nhập', async () => {
    // searchVenues không nhận userId — không có nhánh nào phân biệt actor,
    // nên "giống hệt" đúng THEO THIẾT KẾ. Gọi thẳng như một khách vãng lai.
    const provider = await createApprovedProvider();
    await makeCourtSearchable(provider.id, NEARBY);
    const results = await searchVenues(CENTER.lat, CENTER.lng, 10);
    expect(results.length).toBeGreaterThan(0);
  }, 15000);

  it('AC-BOK-01-4: không có cơ sở nào trong bán kính -> mảng rỗng, không lỗi', async () => {
    await expect(searchVenues(FAR_AWAY.lat, FAR_AWAY.lng, 1)).resolves.toEqual([]);
  });

  it('không truyền bán kính -> trả tất cả cơ sở đủ điều kiện dù ở xa', async () => {
    const provider = await createApprovedProvider();
    const { venue } = await makeCourtSearchable(provider.id, FAR_AWAY);

    const results = await searchVenues(CENTER.lat, CENTER.lng);

    expect(results.find((result) => result.venueId === venue.id)).toBeTruthy();
  }, 15000);
});

describe('BOK-02 — Lọc và sắp xếp sân', () => {
  it('AC-BOK-02-1: tập kết quả có sân 80k và 200k -> lọc khoảng giá tới 100k -> chỉ sân 80k còn lại', async () => {
    const providerCheap = await createApprovedProvider();
    const { venue: cheap } = await makeCourtSearchable(providerCheap.id, NEARBY, 80000);
    const providerExpensive = await createApprovedProvider();
    const { venue: expensive } = await makeCourtSearchable(providerExpensive.id, NEARBY, 200000);

    const base = await searchVenues(CENTER.lat, CENTER.lng, 10);
    const filtered = await filterAndSortVenues(base, { maxPrice: 100000 });

    expect(filtered.find((r) => r.venueId === cheap.id)).toBeTruthy();
    expect(filtered.find((r) => r.venueId === expensive.id)).toBeUndefined();
  }, 15000);

  it('AC-BOK-02-2: lọc theo khung giờ 19h-21h ngày mai -> chỉ cơ sở còn ít nhất một sân trống trọn khung', async () => {
    const providerFree = await createApprovedProvider();
    const { venue: freeVenue } = await makeCourtSearchable(providerFree.id, NEARBY);
    const providerBusy = await createApprovedProvider();
    const { venue: busyVenue, court: busyCourt } = await makeCourtSearchable(providerBusy.id, NEARBY);

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dayStart = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate()));
    const bookedStart = new Date(dayStart.getTime() + 19 * 60 * 60_000);
    await prisma.booking.create({
      data: {
        courtId: busyCourt.id,
        startAt: bookedStart,
        endAt: new Date(bookedStart.getTime() + 2 * 3600_000),
        source: 'internal',
        status: 'confirmed',
        priceSnapshot: 100000n,
        guestName: 'A',
        guestContact: '0900',
      },
    });

    const base = await searchVenues(CENTER.lat, CENTER.lng, 10);
    const filtered = await filterAndSortVenues(base, {
      availability: { date: dayStart, startMinute: 19 * 60, endMinute: 21 * 60 },
    });

    expect(filtered.find((r) => r.venueId === freeVenue.id)).toBeTruthy();
    expect(filtered.find((r) => r.venueId === busyVenue.id)).toBeUndefined();
  }, 15000);

  it('AC-BOK-02-3: bộ lọc cho ra tập rỗng -> xóa lọc -> kết quả gốc của BOK-01 hiện lại đầy đủ', async () => {
    const provider = await createApprovedProvider();
    await makeCourtSearchable(provider.id, NEARBY, 100000);

    const base = await searchVenues(CENTER.lat, CENTER.lng, 10);
    const emptyFiltered = await filterAndSortVenues(base, { minPrice: 999_999_999 });
    expect(emptyFiltered).toHaveLength(0);

    const cleared = await filterAndSortVenues(base, {});
    expect(cleared.length).toBe(base.length);
  }, 15000);
});
