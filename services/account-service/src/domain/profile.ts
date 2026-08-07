import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string;
  phone?: string;
  visibility?: 'public' | 'private';
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

export async function getOwnProfile(userId: string) {
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
  return user;
}
