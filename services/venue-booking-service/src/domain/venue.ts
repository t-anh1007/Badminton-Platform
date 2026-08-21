import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import type { Prisma } from '@prisma/client';
import type { ObjectStorageClient } from '@khoaluantn/object-storage';

/** Turn stored venue images ([{ objectKey }] or legacy strings) into
 * `{ objectKey, url }` entries so the manage UI can render <img src>. */
async function resolveImageEntries(images: unknown, storage: ObjectStorageClient) {
  if (!Array.isArray(images)) return [];
  const keys = images
    .map((image) =>
      typeof image === 'string'
        ? image
        : image && typeof image === 'object' && 'objectKey' in image
          ? String((image as { objectKey: unknown }).objectKey)
          : null,
    )
    .filter((key): key is string => !!key && key.trim().length > 0);
  // Key bắt đầu bằng "/" là asset tĩnh của frontend (apps/web/public), không
  // phải objectKey — trả nguyên xi, đừng map qua object storage.
  return Promise.all(
    keys.map(async (objectKey) => ({
      objectKey,
      url: /^(?:https?:\/\/|\/)/i.test(objectKey) ? objectKey : await storage.getReadUrl(objectKey),
    })),
  );
}

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

const managedVenueInclude = {
  courts: {
    include: {
      operatingHours: true,
      closures: true,
      pricingRules: true,
      bookingRule: true,
    },
    orderBy: { name: 'asc' as const },
  },
} satisfies Prisma.VenueInclude;

type ManagedVenueEntity = Prisma.VenueGetPayload<{ include: typeof managedVenueInclude }>;

async function managedVenueDto(venue: ManagedVenueEntity, storage: ObjectStorageClient) {
  return {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
    amenities: venue.amenities,
    images: await resolveImageEntries(venue.images, storage),
    courts: venue.courts.map((court) => ({
      id: court.id,
      name: court.name,
      active: court.active,
      configuration: {
        operatingHours: court.operatingHours.length,
        pricingRules: court.pricingRules.length,
        bookingRule: Boolean(court.bookingRule),
      },
      operatingHours: court.operatingHours.map(({ id, weekday, openMinute, closeMinute }) => ({ id, weekday, openMinute, closeMinute })),
      closures: court.closures.map(({ id, date, reason }) => ({ id, date, reason })),
      pricingRules: court.pricingRules.map(({ id, weekday, startMinute, endMinute, price, version, effectiveFrom }) => ({ id, weekday, startMinute, endMinute, price: price.toString(), version, effectiveFrom })),
      bookingRule: court.bookingRule && { stepMinutes: court.bookingRule.stepMinutes, minDurationMinutes: court.bookingRule.minDurationMinutes, maxDurationMinutes: court.bookingRule.maxDurationMinutes },
    })),
  };
}

export async function listManagedVenues(userId: string, storage: ObjectStorageClient) {
  const venues = await prisma.venue.findMany({
    where: { provider: { userId } },
    include: managedVenueInclude,
    orderBy: { name: 'asc' },
  });
  return Promise.all(venues.map((venue) => managedVenueDto(venue, storage)));
}

export async function getManagedVenueDetail(userId: string, venueId: string, storage: ObjectStorageClient) {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, provider: { userId } },
    include: managedVenueInclude,
  });
  if (!venue) throw new AppError('FORBIDDEN_NOT_OWNER', 'Không phải chủ sở hữu cơ sở này.', 403);
  return managedVenueDto(venue, storage);
}
