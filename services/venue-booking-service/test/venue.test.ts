import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { createVenue, updateVenue, isVenueSearchable } from '../src/domain/venue.js';
import { createApprovedProvider, fakeUserId } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
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
