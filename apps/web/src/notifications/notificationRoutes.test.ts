import { describe, expect, it } from 'vitest';
import { resolveNotificationRoute } from './notificationRoutes.js';

describe('competitive notification deep links', () => {
  it.each([
    ['match.result.view', 'm1', '/matches/m1'],
    ['provider.match-result.review', 'c1', '/manage/match-results?caseId=c1'],
    ['admin.match-result.review', 'c2', '/admin/match-results?caseId=c2'],
    ['leaderboard.view', null, '/leaderboard'],
    ['reward.view', 'p1', '/rewards/p1'],
    ['reward.payout.view', 'r1', '/rewards/payouts/r1'],
    ['admin.reward-payout.review', 'r2', '/admin/reward-payouts/r2'],
  ] as const)('%s -> %s', (actionKind, entityId, path) => {
    expect(resolveNotificationRoute({ actionKind, entityId, targetRole: 'player' }, 'player')).toBe(path);
  });

  it('has no SMS route', () => {
    expect(resolveNotificationRoute({ actionKind: 'sms.view' as never, entityId: 'x', targetRole: 'player' }, 'player')).toBeNull();
  });
});
