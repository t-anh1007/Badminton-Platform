import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/lib/env.js';

/** Test-only: ký access token giả lập account-service (dùng chung JWT_SECRET). */
export function signTestAccessToken(userId: string, roles: string[]): string {
  return jwt.sign({ sub: userId, roles, type: 'access' }, env.jwtSecret, { expiresIn: '15m' });
}

export function fakeUserId(): string {
  return randomUUID();
}

export async function createApprovedProvider(userId = fakeUserId(), orgName = 'NCC Test') {
  return prisma.provider.create({ data: { userId, orgName, status: 'approved' } });
}

export async function createVenueWithCourt(
  providerId: string,
  coords: { lat: number; lng: number } = { lat: 10.0, lng: 106.0 },
) {
  const venue = await prisma.venue.create({
    data: { providerId, name: 'Venue Test', lat: coords.lat, lng: coords.lng, address: 'Test address' },
  });
  const court = await prisma.court.create({ data: { venueId: venue.id, name: 'San 1', active: true } });
  return { venue, court };
}

/** Sân có đủ giờ hoạt động (0-24h mọi ngày) + biểu giá (hiệu lực từ quá khứ)
 * để BOK-01..06 truy vấn được ngay mà không cần setup lặp lại ở mỗi test. */
export async function makeCourtSearchable(
  providerId: string,
  coords: { lat: number; lng: number } = { lat: 10.0, lng: 106.0 },
  price = 100000,
) {
  const { venue, court } = await createVenueWithCourt(providerId, coords);
  for (let weekday = 0; weekday <= 6; weekday++) {
    await prisma.operatingHour.create({ data: { courtId: court.id, weekday, openMinute: 0, closeMinute: 24 * 60 } });
    await prisma.pricingRule.create({
      data: {
        courtId: court.id,
        weekday,
        startMinute: 0,
        endMinute: 24 * 60,
        price: BigInt(price),
        effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
  }
  return { venue, court };
}
