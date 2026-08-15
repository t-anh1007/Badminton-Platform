import { describe, it, expect, afterAll, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';
import { createApp } from '../src/app.js';
import { createVenue, updateVenue, isVenueSearchable } from '../src/domain/venue.js';
import { createApprovedProvider, fakeUserId, signTestAccessToken } from './helpers.js';
import type { ObjectStorageClient } from '@khoaluantn/object-storage';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Task 7 — owner-scoped management read models', () => {
  it('lists owned venue completion and rejects another provider venue detail', async () => {
    const owner = await createApprovedProvider();
    const other = await createApprovedProvider();
    const venue = await createVenue(owner.userId, { name: 'Sân quản lý', lat: 1, lng: 1, address: 'A' });
    const court = await prisma.court.create({ data: { venueId: venue.id, name: 'Sân 1' } });
    await prisma.operatingHour.create({ data: { courtId: court.id, weekday: 1, openMinute: 480, closeMinute: 1320 } });
    await prisma.pricingRule.create({ data: { courtId: court.id, weekday: 1, startMinute: 480, endMinute: 1320, price: 120000n, effectiveFrom: new Date() } });
    await prisma.bookingRule.create({ data: { courtId: court.id, stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 180 } });
    const ownerToken = signTestAccessToken(owner.userId, ['provider']);
    const list = await request(createApp()).get('/providers/me/venues').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: venue.id, courts: [expect.objectContaining({ id: court.id, configuration: { operatingHours: 1, pricingRules: 1, bookingRule: true } })] })]);
    const otherToken = signTestAccessToken(other.userId, ['provider']);
    await request(createApp()).get(`/providers/me/venues/${venue.id}`).set('Authorization', `Bearer ${otherToken}`).expect(403);
  });
});

describe('Task 15 — provider venue image upload authorization', () => {
  it('only authorizes a provider-owned generated venue image key', async () => {
    const provider = await createApprovedProvider();
    const authorizeUpload = vi.fn< ObjectStorageClient['authorizeUpload'] >().mockResolvedValue({
      objectKey: `venue/images/${provider.userId}/generated.webp`, uploadUrl: 'https://storage.test/upload', headers: { 'Content-Type': 'image/webp' }, expiresAt: '2026-08-14T00:10:00.000Z',
    });
    const app = createApp({ objectStorage: { authorizeUpload, assertOwnedObject: vi.fn(), getReadUrl: vi.fn(), deleteObject: vi.fn() } });
    const token = signTestAccessToken(provider.userId, ['provider']);

    await request(app)
      .post('/providers/me/uploads')
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'image/webp' })
      .expect(201)
      .expect(({ body }) => expect(body.objectKey).toBe(`venue/images/${provider.userId}/generated.webp`));
    expect(authorizeUpload).toHaveBeenCalledWith({ namespace: 'venue/images', ownerUserId: provider.userId, mimeType: 'image/webp' });
    await request(app)
      .post('/providers/me/uploads')
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'image/jpeg', objectKey: 'venue/images/attacker/key.jpg' })
      .expect(400);
  });
});

describe('VEN-03 — Quản lý hồ sơ cơ sở sân', () => {
  it('AC-VEN-03-1: NCC approved tạo cơ sở đủ thông tin gồm tọa độ -> lưu, thuộc đúng NCC', async () => {
    const provider = await createApprovedProvider();
    const venue = await createVenue(provider.userId, {
      name: 'San ABC',
      lat: 10.7,
      lng: 106.6,
      address: '123 Đường X',
    });
    expect(venue.providerId).toBe(provider.id);
  });

  it('AC-VEN-03-2: cơ sở chưa có sân con hoạt động -> không xuất hiện trong tìm kiếm', async () => {
    const provider = await createApprovedProvider();
    const venue = await createVenue(provider.userId, { name: 'V', lat: 1, lng: 1, address: 'A' });
    expect(await isVenueSearchable(venue.id)).toBe(false);
  });

  it('AC-VEN-03-3: NCC A gọi API sửa cơ sở của NCC B -> từ chối', async () => {
    const providerA = await createApprovedProvider();
    const providerB = await createApprovedProvider();
    const venueB = await createVenue(providerB.userId, { name: 'V-B', lat: 1, lng: 1, address: 'B' });

    await expect(
      updateVenue(providerA.userId, venueB.id, { name: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  });

  it('AC-VEN-03-4: hồ sơ NCC đang pending -> thử tạo cơ sở -> từ chối', async () => {
    const userId = fakeUserId();
    await prisma.provider.create({ data: { userId, orgName: 'A', status: 'pending' } });
    await expect(
      createVenue(userId, { name: 'V', lat: 1, lng: 1, address: 'A' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_APPROVED' });
  });
});
