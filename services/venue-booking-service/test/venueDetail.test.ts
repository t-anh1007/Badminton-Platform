import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { getVenueDetail } from '../src/domain/venueDetail.js';
import { createApprovedProvider, createVenueWithCourt } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('BOK-03 — Xem chi tiết cơ sở sân', () => {
  it('AC-BOK-03-1: cơ sở có 3 sân con trong đó 1 sân active=false -> chỉ 2 sân hoạt động được liệt kê', async () => {
    const provider = await createApprovedProvider();
    const { venue, court } = await createVenueWithCourt(provider.id);
    await prisma.court.update({ where: { id: court.id }, data: { active: false } });
    await prisma.court.create({ data: { venueId: venue.id, name: 'San 2', active: true } });
    await prisma.court.create({ data: { venueId: venue.id, name: 'San 3', active: true } });

    const detail = await getVenueDetail(venue.id);
    expect(detail.courts).toHaveLength(2);
  });

  it('AC-BOK-03-2: cơ sở vừa bị ẩn do chủ tài khoản bị khóa -> hiển thị thông báo không khả dụng', async () => {
    const provider = await createApprovedProvider();
    const { venue } = await createVenueWithCourt(provider.id);
    await prisma.provider.update({ where: { id: provider.id }, data: { status: 'suspended' } });

    await expect(getVenueDetail(venue.id)).rejects.toMatchObject({ code: 'VENUE_NOT_AVAILABLE' });
  });
});
