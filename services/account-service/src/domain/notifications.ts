import type { Notification, NotificationCategory, NotificationPriority, UserRole } from '@prisma/client';
import { notificationCategories, type UserNotificationRequestedPayload } from '@khoaluantn/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export type NotificationDto = {
  id: string;
  targetRole: UserRole;
  category: NotificationCategory;
  kind: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  entityType: string | null;
  entityId: string | null;
  actionKind: string | null;
  actionExpiresAt: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationFilter = { page: number; pageSize: number; role?: UserRole; unread?: boolean };
type PreferenceInput = { targetRole: UserRole; category: NotificationCategory; enabled: boolean };

const optionalDefaults: Record<NotificationCategory, boolean> = {
  booking: true, finance: true, match: true, dispute: true, support: true, security: true, community: false,
};

function defaultEnabled(category: NotificationCategory, targetRole: UserRole): boolean {
  // Community chatter stays opt-in for players/providers, but a moderation report
  // is an actionable operational signal for admins.
  return category === 'community' && targetRole === 'admin' ? true : optionalDefaults[category];
}

function toDto(row: Notification): NotificationDto {
  return {
    id: row.id, targetRole: row.targetRole, category: row.category, kind: row.kind,
    title: row.title, body: row.body, priority: row.priority,
    entityType: row.entityType, entityId: row.entityId, actionKind: row.actionKind,
    actionExpiresAt: row.actionExpiresAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
  };
}

async function ownedRoles(userId: string): Promise<UserRole[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
  if (!user) throw new AppError('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', 404);
  return user.roles;
}

function assertOwnedRole(roles: UserRole[], targetRole: UserRole): void {
  if (!roles.includes(targetRole)) throw new AppError('FORBIDDEN', 'Bạn không có vai trò này.', 403);
}

export async function listNotifications(userId: string, filter: NotificationFilter) {
  const roles = await ownedRoles(userId);
  if (filter.role) assertOwnedRole(roles, filter.role);
  const where = {
    userId,
    ...(filter.role ? { targetRole: filter.role } : {}),
    ...(filter.unread ? { readAt: null } : {}),
  };
  const [rows, totalItems, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    items: rows.map(toDto), page: filter.page, pageSize: filter.pageSize, totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / filter.pageSize)), unreadCount, roles,
  };
}

export async function listRecentNotifications(userId: string, limit = 5) {
  await ownedRoles(userId);
  const now = new Date();
  const actionRows = await prisma.notification.findMany({
    where: { userId, priority: 'action_required', OR: [{ actionExpiresAt: null }, { actionExpiresAt: { gt: now } }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit,
  });
  const remaining = Math.max(0, limit - actionRows.length);
  const updateRows = remaining ? await prisma.notification.findMany({
    where: { userId, id: { notIn: actionRows.map((row) => row.id) } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: remaining,
  }) : [];
  const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } });
  return { items: [...actionRows, ...updateRows].map(toDto), unreadCount };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const result = await prisma.notification.updateMany({ where: { id: notificationId, userId, readAt: null }, data: { readAt: new Date() } });
  if (result.count === 0) {
    const exists = await prisma.notification.findFirst({ where: { id: notificationId, userId } });
    if (!exists) throw new AppError('NOTIFICATION_NOT_FOUND', 'Không tìm thấy thông báo.', 404);
  }
  return { unreadCount: await prisma.notification.count({ where: { userId, readAt: null } }) };
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { unreadCount: 0 };
}

export async function getNotificationPreferences(userId: string) {
  const roles = await ownedRoles(userId);
  const stored = await prisma.notificationPreference.findMany({ where: { userId } });
  return roles.flatMap((targetRole) => notificationCategories.map((category) => {
    const row = stored.find((item) => item.targetRole === targetRole && item.category === category);
    return { targetRole, category, enabled: category === 'security' ? true : row?.enabled ?? defaultEnabled(category, targetRole) };
  }));
}

export async function saveNotificationPreference(userId: string, input: PreferenceInput) {
  const roles = await ownedRoles(userId);
  assertOwnedRole(roles, input.targetRole);
  if (input.category === 'security' && !input.enabled) throw new AppError('NOTIFICATION_REQUIRED', 'Thông báo bảo mật luôn được bật.', 409);
  const preference = await prisma.notificationPreference.upsert({
    where: { userId_targetRole_category: { userId, targetRole: input.targetRole, category: input.category } },
    create: { userId, ...input }, update: { enabled: input.enabled },
  });
  return { targetRole: preference.targetRole, category: preference.category, enabled: input.category === 'security' ? true : preference.enabled };
}

export async function projectNotification(sourceEventId: string, payload: UserNotificationRequestedPayload) {
  const recipients = payload.recipient.type === 'user'
    ? [{ userId: payload.recipient.userId, targetRole: payload.recipient.targetRole }]
    : (await prisma.user.findMany({ where: { roles: { has: 'admin' } }, select: { id: true } })).map((user) => ({ userId: user.id, targetRole: 'admin' as const }));
  const projected: Notification[] = [];
  for (const recipient of recipients) {
    const user = await prisma.user.findUnique({ where: { id: recipient.userId }, select: { roles: true } });
    if (!user || !user.roles.includes(recipient.targetRole)) continue;
    const preference = await prisma.notificationPreference.findUnique({
      where: { userId_targetRole_category: { userId: recipient.userId, targetRole: recipient.targetRole, category: payload.category } },
    });
    const enabled = payload.category === 'security' ? true : preference?.enabled ?? defaultEnabled(payload.category, recipient.targetRole);
    if (!enabled) continue;
    const row = await prisma.notification.upsert({
      where: { sourceEventId_userId_targetRole: { sourceEventId, userId: recipient.userId, targetRole: recipient.targetRole } },
      create: {
        userId: recipient.userId, targetRole: recipient.targetRole, category: payload.category, kind: payload.kind,
        title: payload.title, body: payload.body, priority: payload.priority, entityType: payload.entityType,
        entityId: payload.entityId, actionKind: payload.actionKind, actionExpiresAt: payload.actionExpiresAt ? new Date(payload.actionExpiresAt) : null,
        sourceEventId,
      },
      update: {},
    });
    projected.push(row);
  }
  return projected.map((row) => ({ userId: row.userId, notification: toDto(row) }));
}
