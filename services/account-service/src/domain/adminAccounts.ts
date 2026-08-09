import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { revokeAllRefreshTokens } from '../lib/redis.js';
import { writeOutbox } from '../lib/outbox.js';

/** ACC-08 — Khóa tài khoản (AC-ACC-08-1..2). BR-ACC-11: lý do bắt buộc. */
export async function lockAccount(adminUserId: string, targetUserId: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new AppError('REASON_REQUIRED', 'Phải nhập lý do khi khóa tài khoản.', 400);
  }
  if (adminUserId === targetUserId) {
    throw new AppError('CANNOT_LOCK_SELF', 'Không thể khóa chính tài khoản đang đăng nhập.', 400);
  }

  const target = await prisma.user.findUniqueOrThrow({ where: { id: targetUserId } });
  if (target.status === 'locked') {
    throw new AppError('ALREADY_LOCKED', 'Tài khoản đã bị khóa từ trước.', 409);
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: targetUserId },
      data: { status: 'locked', accountLockVersion: { increment: 1 } },
      select: { accountLockVersion: true },
    });
    await tx.accountAudit.create({
      data: { actorUserId: adminUserId, action: 'lock', targetUserId, reason },
    });
    // BR-ACC-11 + phát AccountLocked — venue-booking (G2) tiêu thụ để ẩn cơ sở
    // khỏi tìm kiếm và chặn booking mới; booking đã confirmed KHÔNG bị đụng.
    await writeOutbox(tx, {
      aggregateType: 'User',
      aggregateId: targetUserId,
      eventType: 'AccountLocked',
      payload: {
        userId: targetUserId,
        locked: true,
        reason,
        actorUserId: adminUserId,
        stateVersion: updated.accountLockVersion,
      },
    });
  });

  // BR-ACC-09: thu hồi TOÀN BỘ refresh token của tài khoản bị khóa ngay lập tức.
  await revokeAllRefreshTokens(targetUserId);
}

/** ACC-08 luồng thay thế — Khôi phục tài khoản (AC-ACC-08-5). */
export async function unlockAccount(adminUserId: string, targetUserId: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new AppError('REASON_REQUIRED', 'Phải nhập lý do khi khôi phục tài khoản.', 400);
  }

  const target = await prisma.user.findUniqueOrThrow({ where: { id: targetUserId } });
  if (target.status !== 'locked') {
    throw new AppError('NOT_LOCKED', 'Tài khoản hiện không bị khóa.', 409);
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: targetUserId },
      data: { status: 'active', accountLockVersion: { increment: 1 } },
      select: { accountLockVersion: true },
    });
    await tx.accountAudit.create({
      data: { actorUserId: adminUserId, action: 'unlock', targetUserId, reason },
    });
    await writeOutbox(tx, {
      aggregateType: 'User',
      aggregateId: targetUserId,
      eventType: 'AccountLocked',
      payload: {
        userId: targetUserId,
        locked: false,
        reason,
        actorUserId: adminUserId,
        stateVersion: updated.accountLockVersion,
      },
    });
  });
}
