import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

async function getOwnedCourtOrThrow(userId: string, courtId: string) {
  const court = await prisma.court.findUniqueOrThrow({
    where: { id: courtId },
    include: { venue: { include: { provider: true } } },
  });
  if (court.venue.provider.userId !== userId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Không phải chủ sở hữu sân này.', 403);
  }
  return court;
}

/** VEN-04 — Thêm sân con (AC-VEN-04-1). */
function validateCourtImages(images: unknown): Array<{ objectKey: string }> {
  if (!Array.isArray(images) || images.length < 1 || images.length > 5) {
    throw new AppError('COURT_IMAGES_REQUIRED', 'Mỗi sân con cần từ 1 đến 5 ảnh.', 400);
  }
  const normalized = images.map((image) => {
    const objectKey = image && typeof image === 'object' && 'objectKey' in image
      ? String((image as { objectKey: unknown }).objectKey).trim()
      : '';
    if (!objectKey) throw new AppError('INVALID_COURT_IMAGE', 'Ảnh sân con không hợp lệ.', 400);
    return { objectKey };
  });
  return normalized;
}

export async function addCourt(userId: string, venueId: string, name: string, images: unknown) {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    include: { provider: true },
  });
  if (venue.provider.userId !== userId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Không phải chủ sở hữu cơ sở này.', 403);
  }
  if (venue.provider.status !== 'approved') {
    throw new AppError('PROVIDER_NOT_APPROVED', 'Hồ sơ nhà cung cấp chưa được duyệt.', 403);
  }
  const trimmed = name.trim();
  if (!trimmed) throw new AppError('COURT_NAME_REQUIRED', 'Tên sân không được để trống.', 400);

  const dup = await prisma.court.findFirst({ where: { venueId, name: trimmed } });
  if (dup) throw new AppError('DUPLICATE_COURT_NAME', 'Tên sân đã tồn tại trong cơ sở này.', 409);

  return prisma.court.create({ data: { venueId, name: trimmed, active: true, images: validateCourtImages(images) } });
}

export async function updateCourt(userId: string, courtId: string, input: { name?: string; images?: unknown }) {
  const court = await getOwnedCourtOrThrow(userId, courtId);
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new AppError('COURT_NAME_REQUIRED', 'Tên sân không được để trống.', 400);
  return prisma.court.update({
    where: { id: court.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(input.images !== undefined ? { images: validateCourtImages(input.images) } : {}),
    },
  });
}

/** VEN-04 — Vô hiệu hóa sân con (AC-VEN-04-2, 03, 05). BR-VEN-05/05a: chặn nếu
 * còn booking confirmed tương lai HOẶC hold chưa hết hạn. */
export async function deactivateCourt(userId: string, courtId: string): Promise<void> {
  const court = await getOwnedCourtOrThrow(userId, courtId);
  const now = new Date();

  const futureConfirmed = await prisma.booking.findMany({
    where: { courtId: court.id, status: 'confirmed', startAt: { gt: now } },
    select: { id: true, startAt: true, endAt: true },
  });
  if (futureConfirmed.length > 0) {
    throw new AppError(
      'BLOCKED_BY_FUTURE_BOOKINGS',
      `Còn ${futureConfirmed.length} booking đã xác nhận trong tương lai. Hủy qua BOK-10 trước khi vô hiệu hóa.`,
      409,
      { bookings: futureConfirmed },
    );
  }

  const activeHold = await prisma.hold.findFirst({
    where: { courtId: court.id, expiresAt: { gt: now } },
    orderBy: { expiresAt: 'asc' },
  });
  if (activeHold) {
    throw new AppError(
      'BLOCKED_BY_ACTIVE_HOLD',
      `Còn một lượt giữ chỗ chưa hết hạn, thử lại sau ${activeHold.expiresAt.toISOString()}.`,
      409,
      { holdExpiresAt: activeHold.expiresAt },
    );
  }

  await prisma.court.update({ where: { id: court.id }, data: { active: false } });
}

/** Ngừng toàn bộ cơ sở bằng cách vô hiệu hóa đồng loạt các sân con.
 * Kiểm tra hết ràng buộc trước khi cập nhật để không tạo trạng thái dở dang. */
export async function deactivateVenueCourts(userId: string, venueId: string): Promise<number> {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    include: { provider: true, courts: { where: { active: true }, select: { id: true } } },
  });
  if (venue.provider.userId !== userId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Không phải chủ sở hữu cơ sở này.', 403);
  }

  const courtIds = venue.courts.map((court) => court.id);
  if (courtIds.length === 0) return 0;
  const now = new Date();
  const futureConfirmed = await prisma.booking.findMany({
    where: { courtId: { in: courtIds }, status: 'confirmed', startAt: { gt: now } },
    select: { id: true, courtId: true, startAt: true, endAt: true },
  });
  if (futureConfirmed.length > 0) {
    throw new AppError(
      'BLOCKED_BY_FUTURE_BOOKINGS',
      `Còn ${futureConfirmed.length} booking đã xác nhận trong tương lai. Hủy qua BOK-10 trước khi ngừng cơ sở.`,
      409,
      { bookings: futureConfirmed },
    );
  }

  const activeHold = await prisma.hold.findFirst({
    where: { courtId: { in: courtIds }, expiresAt: { gt: now } },
    orderBy: { expiresAt: 'asc' },
  });
  if (activeHold) {
    throw new AppError(
      'BLOCKED_BY_ACTIVE_HOLD',
      `Còn một lượt giữ chỗ chưa hết hạn, thử lại sau ${activeHold.expiresAt.toISOString()}.`,
      409,
      { holdExpiresAt: activeHold.expiresAt },
    );
  }

  const result = await prisma.court.updateMany({ where: { id: { in: courtIds } }, data: { active: false } });
  return result.count;
}

/** Kích hoạt lại sân con; chỉ đổi cờ active nên toàn bộ lịch sử booking/doanh thu được giữ nguyên. */
export async function activateCourt(userId: string, courtId: string): Promise<void> {
  const court = await getOwnedCourtOrThrow(userId, courtId);
  await prisma.court.update({ where: { id: court.id }, data: { active: true } });
}

/** Kích hoạt lại toàn bộ sân con của cơ sở mà không thay đổi dữ liệu lịch sử. */
export async function activateVenueCourts(userId: string, venueId: string): Promise<number> {
  const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId }, include: { provider: true } });
  if (venue.provider.userId !== userId) {
    throw new AppError('FORBIDDEN_NOT_OWNER', 'Không phải chủ sở hữu cơ sở này.', 403);
  }
  const result = await prisma.court.updateMany({ where: { venueId, active: false }, data: { active: true } });
  return result.count;
}

/** VEN-04 — Lịch sử booking của sân (AC-VEN-04-4) — không lọc theo active. */
export async function getCourtBookingHistory(userId: string, courtId: string) {
  const court = await getOwnedCourtOrThrow(userId, courtId);
  return prisma.booking.findMany({ where: { courtId: court.id }, orderBy: { startAt: 'desc' } });
}
