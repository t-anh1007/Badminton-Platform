import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

/** BOK-03 — Xem chi tiết cơ sở sân (AC-BOK-03-1..2). Công khai. */
export async function getVenueDetail(venueId: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: { provider: true, courts: true },
  });
  if (!venue) {
    throw new AppError('VENUE_NOT_FOUND', 'Không tìm thấy cơ sở.', 404);
  }
  // AC-BOK-03-2: cơ sở vừa bị ẩn do chủ tài khoản bị khóa (Provider chuyển
  // suspended qua consumer AccountLocked, G2) -> thông báo không khả dụng,
  // không phải lỗi kỹ thuật.
  if (venue.provider.status !== 'approved') {
    throw new AppError('VENUE_NOT_AVAILABLE', 'Cơ sở hiện không khả dụng.', 404);
  }

  return {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
    amenities: venue.amenities,
    images: venue.images,
    // AC-BOK-03-1: chỉ liệt kê sân con đang hoạt động.
    courts: venue.courts.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name })),
  };
}
