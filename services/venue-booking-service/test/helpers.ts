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

export async function createVenueWithCourt(providerId: string) {
  const venue = await prisma.venue.create({
    data: { providerId, name: 'Venue Test', lat: 10.0, lng: 106.0, address: 'Test address' },
  });
  const court = await prisma.court.create({ data: { venueId: venue.id, name: 'San 1', active: true } });
  return { venue, court };
}
