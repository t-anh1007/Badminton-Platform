import type { EmailSender } from '../lib/email.js';
import { emailLink, renderEmail } from '../lib/emailTemplate.js';
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
  bookingBusinessCode: string | null;
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
    entityType: row.entityType, entityId: row.entityId, bookingBusinessCode: row.bookingBusinessCode, actionKind: row.actionKind,
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

export async function listRecentNotifications(userId: string, limit = 20) {
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

export function notificationDeliveryAllowed(payload: UserNotificationRequestedPayload, preferenceEnabled: boolean): boolean {
  // Thông báo có email bắt buộc (kèo cạnh tranh, thưởng) cũng bỏ qua tùy chọn tắt danh mục.
  return payload.deliveryPolicy === 'required' || payload.emailPolicy === 'required' || payload.category === 'security' || preferenceEnabled;
}

/**
 * Email giao dịch cho thông báo bắt buộc, chạy sau khi inbox đã ghi bền. Mỗi dòng gửi tối đa một lần thành
 * công (emailSentAt); lỗi nhà cung cấp giữ emailSentAt=null để lần giao lại event thử tiếp, không nhân bản inbox.
 */
export async function deliverRequiredEmails(
  notificationIds: string[],
  payload: UserNotificationRequestedPayload,
  sender: Pick<EmailSender, 'send'>,
  now = () => new Date(),
) {
  if (payload.emailPolicy !== 'required') return;
  let failure: unknown;
  for (const id of notificationIds) {
    try {
      await sendRequiredEmail(id, sender, now);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

/** Trang web đích của thông báo; cùng bảng với apps/web/src/notifications/notificationRoutes.ts. */
export function notificationPath(row: Pick<Notification, 'actionKind' | 'entityId' | 'targetRole'>): string | null {
  if (row.actionKind === 'leaderboard.view') return '/leaderboard';
  if (!row.entityId) return null;
  const id = encodeURIComponent(row.entityId);
  switch (row.actionKind) {
    case 'match.view': case 'match.result.view': return `/matches/${id}`;
    case 'provider.match-result.review': return `/manage/match-results?caseId=${id}`;
    case 'admin.match-result.review': return `/admin/match-results?caseId=${id}`;
    case 'reward.view': return `/rewards/${id}`;
    case 'reward.payout.view': return `/rewards/payouts/${id}`;
    case 'admin.reward-payout.review': return `/admin/reward-payouts/${id}`;
    case 'support.view': return `/support?ticket=${id}`;
    case 'dispute.view': return `/profile?tab=disputes&dispute=${id}`;
    case 'withdrawal.view': return `/manage?withdrawal=${id}`;
    case 'admin.dispute.review': return `/admin/disputes?dispute=${id}`;
    case 'admin.withdrawal.review': return `/admin?withdrawal=${id}`;
    case 'admin.provider.review': return `/admin/providers?provider=${id}`;
    case 'admin.moderation.review': return `/admin/moderation?report=${id}`;
    case 'admin.ticket.view': return `/admin/tickets?ticket=${id}`;
    case 'booking.pay': return `/booking?booking=${id}`;
    case 'booking.view': return row.targetRole === 'provider' ? `/manage/bookings?booking=${id}`
      : row.targetRole === 'admin' ? `/admin/bookings?booking=${id}` : `/profile?tab=bookings&booking=${id}`;
    default: return null;
  }
}

const ACTION_LABELS: Record<string, string> = {
  'match.view': 'Mở kèo', 'match.result.view': 'Xem kết quả kèo', 'leaderboard.view': 'Xem bảng xếp hạng',
  'reward.view': 'Xem chương trình thưởng', 'reward.payout.view': 'Xem khoản thưởng',
  'provider.match-result.review': 'Xem xét kết quả', 'admin.match-result.review': 'Xem xét kết quả',
  'admin.reward-payout.review': 'Xử lý khoản thưởng',
};
const ROLE_LABELS: Record<UserRole, string> = { player: 'Người chơi', provider: 'Chủ sân', admin: 'Quản trị viên' };

/** Email thông báo: tiêu đề, nội dung, thời điểm và nút dẫn về đúng trang trên web production (qua đăng nhập). */
export function notificationEmail(
  row: Pick<Notification, 'title' | 'body' | 'actionKind' | 'entityId' | 'targetRole' | 'createdAt' | 'actionExpiresAt'>,
  greetingName?: string | null,
) {
  const path = notificationPath(row);
  return renderEmail({
    heading: row.title,
    greetingName,
    paragraphs: [row.body],
    details: [
      ['Thời điểm', formatVietnamTime(row.createdAt)],
      ...(row.actionExpiresAt ? [['Hạn xử lý', formatVietnamTime(row.actionExpiresAt)] as [string, string]] : []),
      ['Vai trò', ROLE_LABELS[row.targetRole]],
    ],
    action: {
      label: (row.actionKind && ACTION_LABELS[row.actionKind]) ?? (path ? 'Xem chi tiết' : 'Mở thông báo'),
      url: emailLink(`/auth?next=${encodeURIComponent(path ?? '/notifications')}`),
    },
    reason: 'Bạn nhận email này vì đây là thông báo quan trọng về tài khoản Courtin của bạn.',
  });
}

const formatVietnamTime = (value: Date) =>
  `${value.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })} (giờ Việt Nam)`;

async function sendRequiredEmail(id: string, sender: Pick<EmailSender, 'send'>, now: () => Date) {
  const row = await prisma.notification.findUnique({
    where: { id }, include: { user: { select: { email: true, playerProfile: { select: { displayName: true } } } } },
  });
  if (!row || row.emailSentAt) return;
  await prisma.notification.update({ where: { id }, data: { emailLastAttemptAt: now() } });
  const email = notificationEmail(row, row.user.playerProfile?.displayName);
  await sender.send(row.user.email, row.title, email.text, email.html);
  await prisma.notification.update({ where: { id }, data: { emailSentAt: now() } });
}

export const REQUIRED_EMAIL_RETRY_DELAY_MS = 5 * 60_000;
const REQUIRED_EMAIL_RETRY_WINDOW_MS = 7 * 24 * 60 * 60_000;

/**
 * Lưới an toàn cho email bắt buộc: chỉ dòng đã từng thử gửi (emailLastAttemptAt) là email bắt buộc, nên dòng chưa
 * gửi được sẽ được thử lại mỗi >= 5 phút trong 7 ngày, không phụ thuộc số lần RabbitMQ giao lại event.
 */
export async function retryPendingRequiredEmails(sender: Pick<EmailSender, 'send'>, now = new Date()) {
  const due = await prisma.notification.findMany({
    where: {
      emailSentAt: null,
      emailLastAttemptAt: { not: null, lte: new Date(now.getTime() - REQUIRED_EMAIL_RETRY_DELAY_MS) },
      createdAt: { gte: new Date(now.getTime() - REQUIRED_EMAIL_RETRY_WINDOW_MS) },
    },
    orderBy: { emailLastAttemptAt: 'asc' }, take: 50, select: { id: true },
  });
  let sent = 0;
  for (const { id } of due) {
    try {
      await sendRequiredEmail(id, sender, () => now);
      sent += 1;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[account-service] gửi lại email bắt buộc thất bại:', id, error);
    }
  }
  return sent;
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
    if (!notificationDeliveryAllowed(payload, preference?.enabled ?? defaultEnabled(payload.category, recipient.targetRole))) continue;
    const row = await prisma.notification.upsert({
      where: { sourceEventId_userId_targetRole: { sourceEventId, userId: recipient.userId, targetRole: recipient.targetRole } },
      create: {
        userId: recipient.userId, targetRole: recipient.targetRole, category: payload.category, kind: payload.kind,
        title: payload.title, body: payload.body, priority: payload.priority, entityType: payload.entityType,
        entityId: payload.entityId, bookingBusinessCode: payload.bookingBusinessCode, actionKind: payload.actionKind, actionExpiresAt: payload.actionExpiresAt ? new Date(payload.actionExpiresAt) : null,
        sourceEventId,
      },
      update: {},
    });
    projected.push(row);
  }
  return projected.map((row) => ({ userId: row.userId, notification: toDto(row) }));
}
