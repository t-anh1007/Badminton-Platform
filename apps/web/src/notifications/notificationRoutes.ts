import type { NotificationItem, NotificationRole } from '../lib/notificationApi.js';
export function resolveNotificationRoute(item: Pick<NotificationItem, 'actionKind' | 'entityId' | 'targetRole'>, activeRole: NotificationRole) {
  if (item.actionKind === 'leaderboard.view') return '/leaderboard';
  if (!item.entityId) return null;
  switch (item.actionKind) {
    case 'match.result.view': return `/matches/${item.entityId}`;
    case 'provider.match-result.review': return `/manage/match-results?caseId=${item.entityId}`;
    case 'admin.match-result.review': return `/admin/match-results?caseId=${item.entityId}`;
    case 'reward.view': return `/rewards/${item.entityId}`;
    case 'reward.payout.view': return `/rewards/payouts/${item.entityId}`;
    case 'admin.reward-payout.review': return `/admin/reward-payouts/${item.entityId}`;
    case 'match.view': return `/matches/${item.entityId}`;
    case 'support.view': return `/support?ticket=${item.entityId}`;
    case 'dispute.view': return `/profile?tab=disputes&dispute=${item.entityId}`;
    case 'withdrawal.view': return `/manage/finance?withdrawal=${item.entityId}`;
    case 'admin.dispute.review': return `/admin/disputes?dispute=${item.entityId}`;
    case 'admin.withdrawal.review': return `/admin?withdrawal=${item.entityId}`;
    case 'admin.provider.review': return `/admin/providers?provider=${item.entityId}`;
    case 'admin.moderation.review': return `/admin/moderation?report=${item.entityId}`;
    case 'admin.ticket.view': return `/admin/tickets?ticket=${item.entityId}`;
    case 'booking.pay': return `/booking?booking=${item.entityId}`;
    case 'booking.view': return activeRole === 'provider' ? `/manage/bookings?booking=${item.entityId}` : activeRole === 'admin' ? `/admin/bookings?booking=${item.entityId}` : `/profile?tab=bookings&booking=${item.entityId}`;
    default: return null;
  }
}
