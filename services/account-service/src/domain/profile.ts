import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { publicMatchProfileSchema } from '@khoaluantn/shared';
import type { ObjectStorageClient } from '@khoaluantn/object-storage';

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string;
  phone?: string;
  visibility?: 'public' | 'private';
}

/** Trả về danh tính công khai (tên + avatar) cho danh sách userId — dùng để enrich
 * feed cộng đồng, gợi ý kèo, v.v. Không trả lỗi khi thiếu — user không tìm thấy
 * hoặc riêng tư sẽ có `displayName: null`, caller tự hiển thị fallback. */
type StorageResolver = () => ObjectStorageClient;

async function browserAvatarUrl(value: string | null, resolveStorage?: StorageResolver) {
  if (!value || !value.startsWith('profile/avatars/') || !resolveStorage) return value;
  return resolveStorage().getReadUrl(value);
}

export async function getPublicDisplayNames(userIds: string[], resolveStorage?: StorageResolver) {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      verified: true,
      status: true,
      roles: true,
      playerProfile: { select: { displayName: true, avatarUrl: true, visibility: true } },
    },
  });
  return Promise.all(userIds.map(async (userId) => {
    const user = users.find((current) => current.id === userId);
    if (!user || !user.verified || user.status !== 'active' || !user.playerProfile) {
      return { userId, displayName: null, avatarUrl: null };
    }
    const isPublic = user.playerProfile.visibility === 'public';
    return {
      userId,
      displayName: isPublic ? user.playerProfile.displayName : null,
      avatarUrl: isPublic ? await browserAvatarUrl(user.playerProfile.avatarUrl, resolveStorage) : null,
    };
  }));
}

export async function getPublicMatchProfile(userId: string, resolveStorage?: StorageResolver) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      verified: true,
      status: true,
      roles: true,
      playerProfile: { select: { displayName: true, avatarUrl: true, visibility: true } },
    },
  });
  if (
    !user
    || !user.verified
    || user.status !== 'active'
    || !user.roles.includes('player')
    || !user.playerProfile
  ) {
    throw new AppError('PLAYER_NOT_FOUND', 'Không tìm thấy người chơi.', 404);
  }
  const identityVisibility = user.playerProfile.visibility === 'public' ? 'public' : 'hidden';
  return publicMatchProfileSchema.parse({
    userId: user.id,
    displayName: identityVisibility === 'public' ? user.playerProfile.displayName : 'Người tổ chức',
    avatarUrl: identityVisibility === 'public' ? await browserAvatarUrl(user.playerProfile.avatarUrl, resolveStorage) : null,
    identityVisibility,
  });
}

/** ACC-07 — Cập nhật hồ sơ CỦA CHÍNH MÌNH (AC-ACC-07-1..3).
 * Không nhận targetUserId — luôn thao tác trên `userId` lấy từ access token,
 * nên AC-ACC-07-3 (không sửa hộ người khác) đúng theo THIẾT KẾ, không cần
 * thêm kiểm tra quyền sở hữu riêng. Email KHÔNG nằm trong input type này —
 * AC-ACC-07-2 cũng đúng theo thiết kế (API không có cách nhận email để sửa). */
export async function updateOwnProfile(userId: string, input: UpdateProfileInput) {
  if (input.displayName !== undefined && !input.displayName.trim()) {
    throw new AppError('DISPLAY_NAME_REQUIRED', 'Tên hiển thị không được để trống.', 400);
  }

  const profile = await prisma.$transaction(async (tx) => {
    const updated = await tx.playerProfile.update({
      where: { userId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      },
    });
    if (input.phone !== undefined) {
      await tx.user.update({ where: { id: userId }, data: { phone: input.phone } });
    }
    return updated;
  });

  return profile;
}

export async function getOwnProfile(userId: string, resolveStorage?: StorageResolver) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    // Chỉ chọn các field là contract của UI. Không trả nguyên Prisma User vì
    // nó chứa passwordHash và có thể lộ thêm field nội bộ khi model đổi.
    select: {
      id: true,
      email: true,
      phone: true,
      roles: true,
      verified: true,
      status: true,
      createdAt: true,
      playerProfile: true,
    },
  });
  return user.playerProfile
    ? { ...user, playerProfile: { ...user.playerProfile, avatarUrl: await browserAvatarUrl(user.playerProfile.avatarUrl, resolveStorage) } }
    : user;
}
