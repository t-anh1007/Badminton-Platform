import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export interface CreateVenueInput {
  name: string;
  lat: number;
  lng: number;
  address: string;
  amenities?: unknown;
  images?: unknown;
}

async function requireApprovedProviderOwnedByUser(userId: string) {
  const provider = await prisma.provider.findFirst({ where: { userId } });
  if (!provider || provider.status !== 'approved') {
    // BR-VEN-02
    throw new AppError('PROVIDER_NOT_APPROVED', 'Hồ sơ nhà cung cấp chưa được duyệt.', 403);
  }
  return provider;
}

/** VEN-03 — Tạo cơ sở (AC-VEN-03-1, AC-VEN-03-4). */
export async function createVenue(userId: string, input: CreateVenueInput) {
  const provider = await requireApprovedProviderOwnedByUser(userId);

  if (!input.name.trim() || !input.address.trim()) {
    throw new AppError('MISSING_FIELDS', 'Thiếu tên hoặc địa chỉ cơ sở.', 400);
  }
  if (input.lat === undefined || input.lng === undefined || Number.isNaN(input.lat) || Number.isNaN(input.lng)) {
    throw new AppError('MISSING_COORDINATES', 'Thiếu tọa độ cơ sở.', 400);
  }

  return prisma.venue.create({
    data: {
      providerId: provider.id,
      name: input.name,
      lat: input.lat,
      lng: input.lng,
      address: input.address,
      amenities: input.amenities as never,
      images: input.images as never,
    },
  });
}

/** VEN-03 — Sửa cơ sở, chỉ chủ sở hữu (AC-VEN-03-3, BR-VEN-11). */
export async function updateVenue(
  userId: string,
  venueId: string,
  input: Partial<CreateVenueInput>,
) {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    include: { provider: true },
  });
  if (venue.provider.userId !== userId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Không phải chủ sở hữu cơ sở này.', 403);
  }
  return prisma.venue.update({
    where: { id: venueId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.lat !== undefined ? { lat: input.lat } : {}),
      ...(input.lng !== undefined ? { lng: input.lng } : {}),
      ...(input.amenities !== undefined ? { amenities: input.amenities as never } : {}),
      ...(input.images !== undefined ? { images: input.images as never } : {}),
    },
  });
}

/** BR-VEN-03 — điều kiện cơ sở xuất hiện trong tìm kiếm (BOK-01, G3 sẽ gọi lại
 * predicate này). G2 chỉ định nghĩa điều kiện; truy vấn tìm kiếm đầy đủ theo
 * vị trí/khung giờ thuộc BOK-01 (G3). */
export async function isVenueSearchable(venueId: string): Promise<boolean> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: {
      provider: true,
      courts: {
        where: { active: true },
        include: { operatingHours: true, pricingRules: true },
      },
    },
  });
  if (!venue) return false;
  if (venue.provider.status !== 'approved') return false;
  const hasUsableCourt = venue.courts.some(
    (c) => c.operatingHours.length > 0 && c.pricingRules.length > 0,
  );
  return hasUsableCourt;
}
