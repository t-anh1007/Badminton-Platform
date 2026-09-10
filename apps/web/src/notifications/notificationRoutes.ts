import type { NotificationItem, NotificationRole } from '../lib/notificationApi.js';
export function resolveNotificationRoute(item: Pick<NotificationItem, 'actionKind' | 'entityId' | 'targetRole'>, activeRole: NotificationRole) {
  if (!item.entityId) return null;
  switch (item.actionKind) {
    case 'match.view': return `/matches/${item.entityId}`;
    case 'support.view': return `/support?ticket=${item.entityId}`;
    case 'dispute.view': return `/profile?tab=disputes&dispute=${item.entityId}`;
    case 'withdrawal.view': return `/manage/finance?withdrawal=${item.entityId}`;
    case 'admin.dispute.review': return `/admin/disputes?dispute=${item.entityId}`;
    case 'admin.withdrawal.review': return `/admin/finance?withdrawal=${item.entityId}`;
    case 'admin.provider.review': return `/admin/providers?provider=${item.entityId}`;
    case 'admin.moderation.review': return `/admin/moderation?report=${item.entityId}`;
    case 'admin.ticket.view': return `/admin/tickets?ticket=${item.entityId}`;
    case 'booking.pay': return `/booking?booking=${item.entityId}`;
    case 'booking.view': return activeRole === 'provider' ? `/manage/calendar?booking=${item.entityId}` : activeRole === 'admin' ? `/admin/bookings?booking=${item.entityId}` : `/profile?tab=bookings&booking=${item.entityId}`;
    default: return null;
  }
}
