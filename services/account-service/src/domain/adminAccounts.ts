import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { revokeAllRefreshTokens } from '../lib/redis.js';
import { writeOutbox } from '../lib/outbox.js';
import { setAccountLocked } from '@khoaluantn/eventbus';

/** Ghi trạng thái khóa sang Redis để mọi service chặn ngay; lỗi chỉ log (DB vẫn là nguồn thật). */
async function publishLockState(userId: string, locked: boolean): Promise<void> {
  try { await setAccountLocked(userId, locked); } catch (error) { console.warn('[account-lock] Không ghi được Redis cho', userId, (error as Error).message); }
}

/** Khởi động: đồng bộ các tài khoản đang khóa sang Redis (dữ liệu khóa từ trước hoặc Redis vừa khởi động lại). */
export async function syncLockedAccounts(): Promise<void> {
  const rows = await prisma.user.findMany({ where: { status: 'locked' }, select: { id: true } });
  for (const row of rows) await publishLockState(row.id, true);
}

export async function listAdminAccounts(input: { query?: string; status?: 'active' | 'locked' }) {
  const query = input.query?.trim();
  return prisma.user.findMany({ where: { ...(input.status ? { status: input.status } : {}), ...(query ? { OR: [{ businessCode: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }, { playerProfile: { displayName: { contains: query, mode: 'insensitive' } } }] } : {}) }, include: { playerProfile: { select: { displayName: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }).then(rows => rows.map(row => ({ id: row.id, businessCode: row.businessCode, email: row.email, displayName: row.playerProfile?.displayName ?? null, status: row.status, roles: row.roles })));
}

export async function getAdminAccountIdentities(userIds: string[]) {
  if (userIds.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, businessCode: true, email: true, playerProfile: { select: { displayName: true } } },
  }).then((rows) => rows.map((row) => ({
    id: row.id,
    businessCode: row.businessCode,
    email: row.email,
    displayName: row.playerProfile?.displayName ?? null,
  })));
}

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
    // Tuần tự hóa mọi thao tác khóa: hai admin khóa chéo nhau cùng lúc không được làm hệ thống mất hết admin.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('account-lock'))`;
    const [actor, current] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: adminUserId }, select: { status: true } }),
      tx.user.findUniqueOrThrow({ where: { id: targetUserId }, select: { status: true, roles: true } }),
    ]);
    if (actor.status !== 'active') throw new AppError('ACTOR_LOCKED', 'Tài khoản của bạn vừa bị khóa nên không thể thực hiện thao tác này.', 403);
    if (current.status === 'locked') throw new AppError('ALREADY_LOCKED', 'Tài khoản đã bị khóa từ trước.', 409);
    if (current.roles.includes('admin')) {
      const otherActiveAdmins = await tx.user.count({ where: { id: { not: targetUserId }, status: 'active', roles: { has: 'admin' } } });
      if (otherActiveAdmins < 1) throw new AppError('LAST_ADMIN', 'Không thể khóa quản trị viên cuối cùng còn hoạt động.', 409);
    }
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

  // PO 03/10: chặn mọi access token còn hạn ngay lập tức (qua Redis dùng chung).
  await publishLockState(targetUserId, true);
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
  await publishLockState(targetUserId, false);
}
