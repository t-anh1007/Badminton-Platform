import { prisma } from '../lib/prisma.js';

const DEFAULT_RADIUS_KM = 10; // A-BOK-04

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface VenueSearchResult {
  venueId: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  amenities: unknown;
  images: unknown;
  distanceKm: number;
  lowestPrice: bigint | null;
}

function lowestPriceForVenue(
  courts: Array<{ pricingRules: Array<{ price: bigint; version: number }> }>,
): bigint | null {
  let min: bigint | null = null;
  for (const court of courts) {
    const latestVersion = court.pricingRules[0]?.version;
    const windows = court.pricingRules.filter((rule) => rule.version === latestVersion);
    for (const w of windows) {
      if (min === null || w.price < min) min = w.price;
    }
  }
  return min;
}

/** BOK-01 — Tìm sân bằng danh sách và bản đồ (AC-BOK-01-1..4). Công khai,
 * không cần đăng nhập (AC-01-3: kết quả giống hệt khách vs người đã đăng nhập
 * — hàm này không nhận userId, không có nhánh nào phân biệt theo actor). */
export async function searchVenues(
  lat: number,
  lng: number,
  radiusKm: number = DEFAULT_RADIUS_KM,
): Promise<VenueSearchResult[]> {
  const now = new Date();
  const weekday = now.getUTCDay();
  const venues = await prisma.venue.findMany({
    where: {
      provider: { status: 'approved' },
      courts: {
        some: {
          active: true,
          operatingHours: { some: {} },
          pricingRules: { some: {} },
        },
      },
    },
    include: {
      courts: {
        where: { active: true },
        include: {
          pricingRules: {
            where: { weekday, effectiveFrom: { lte: now } },
            orderBy: [{ version: 'desc' }, { startMinute: 'asc' }],
          },
        },
      },
    },
  });
  const results: VenueSearchResult[] = [];

  for (const venue of venues) {
    const distanceKm = haversineKm(lat, lng, venue.lat, venue.lng);
    if (distanceKm > radiusKm) continue;
    // BR-BOK-01: chỉ cơ sở thỏa BR-VEN-03 (approved + sân active + giờ + giá).

    results.push({
      venueId: venue.id,
      name: venue.name,
      lat: venue.lat,
      lng: venue.lng,
      address: venue.address,
      amenities: venue.amenities,
      images: venue.images,
      distanceKm,
      lowestPrice: lowestPriceForVenue(venue.courts),
    });
  }

  return results;
}

export interface FilterParams {
  maxPrice?: number;
  minPrice?: number;
  /** Lọc theo khung giờ còn trống trọn vẹn (AC-BOK-02-2). */
  availability?: { date: Date; startMinute: number; endMinute: number };
  sortBy?: 'distance' | 'price';
}

/** BOK-02 — Lọc và sắp xếp trên tập kết quả BOK-01 (AC-BOK-02-1..3). */
export async function filterAndSortVenues(
  base: VenueSearchResult[],
  params: FilterParams,
): Promise<VenueSearchResult[]> {
  let results = base;

  if (params.minPrice !== undefined) {
    results = results.filter((r) => r.lowestPrice !== null && r.lowestPrice >= BigInt(params.minPrice!));
  }
  if (params.maxPrice !== undefined) {
    results = results.filter((r) => r.lowestPrice !== null && r.lowestPrice <= BigInt(params.maxPrice!));
  }

  if (params.availability) {
    const { date, startMinute, endMinute } = params.availability;
    const startAt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, startMinute));
    const endAt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, endMinute));
    const now = new Date();
    const freeCourts = await prisma.court.findMany({
      where: {
        venueId: { in: results.map((result) => result.venueId) },
        active: true,
        bookings: {
          none: { status: 'confirmed', startAt: { lt: endAt }, endAt: { gt: startAt } },
        },
        holds: {
          none: { expiresAt: { gt: now }, startAt: { lt: endAt }, endAt: { gt: startAt } },
        },
      },
      select: { venueId: true },
    });
    const venueIdsWithFreeCourt = new Set(freeCourts.map((court) => court.venueId));
    results = results.filter((result) => venueIdsWithFreeCourt.has(result.venueId));
  }

  if (params.sortBy === 'price') {
    results = [...results].sort((a, b) => {
      if (a.lowestPrice === null) return 1;
      if (b.lowestPrice === null) return -1;
      return a.lowestPrice < b.lowestPrice ? -1 : a.lowestPrice > b.lowestPrice ? 1 : 0;
    });
  } else {
    results = [...results].sort((a, b) => a.distanceKm - b.distanceKm);
  }

  return results;
}
