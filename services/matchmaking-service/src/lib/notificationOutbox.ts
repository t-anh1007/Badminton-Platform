import type { Prisma } from '@prisma/client';
import { writeOutbox } from './outbox.js';

type MatchNotification = {
  matchId: string;
  organizerUserId: string;
  kind: 'match.confirmed' | 'match.cancelled';
  title: string;
  body: string;
};

/** Fan out only permanent match outcomes to the organizer and current members.
 * Pending/held joins are deliberately excluded: their payment hold is transient. */
export async function writeMatchOutcomeNotifications(
  tx: Prisma.TransactionClient,
  notification: MatchNotification,
) {
  const joins = await tx.join.findMany({
    where: { matchId: notification.matchId, status: 'confirmed' },
    select: { participantUserId: true },
  });
  const recipients = new Set([notification.organizerUserId, ...joins.map((join) => join.participantUserId)]);
  await Promise.all([...recipients].map((userId) => writeOutbox(tx, {
    aggregateType: 'Notification',
    aggregateId: `${notification.kind}:${notification.matchId}:${userId}`,
    eventType: 'UserNotificationRequested',
    payload: {
      recipient: { type: 'user', userId, targetRole: 'player' },
      category: 'match',
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      priority: 'update',
      entityType: 'match',
      entityId: notification.matchId,
      actionKind: 'match.view',
      actionExpiresAt: null,
    },
  })));
}

type ResultNotificationRecipient =
  | { type: 'user'; userId: string; targetRole: 'player' | 'provider' }
  | { type: 'role'; targetRole: 'admin' };

/** Thông báo luồng kết quả kèo cạnh tranh: in-app + email bắt buộc (BR-CM-40, Task 22 giao email). */
export async function writeResultNotification(
  tx: Prisma.TransactionClient,
  notification: {
    recipients: ResultNotificationRecipient[];
    kind: string;
    title: string;
    body: string;
    matchId: string;
    caseId: string;
    actionKind: 'match.result.view' | 'provider.match-result.review' | 'admin.match-result.review';
  },
) {
  const player = notification.actionKind === 'match.result.view';
  await Promise.all(notification.recipients.map((recipient) => writeOutbox(tx, {
    aggregateType: 'Notification',
    aggregateId: `${notification.kind}:${notification.caseId}:${recipient.type === 'user' ? recipient.userId : 'admin'}`,
    eventType: 'UserNotificationRequested',
    payload: {
      recipient,
      category: player ? 'match' : 'dispute',
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      priority: player ? 'update' : 'action_required',
      entityType: player ? 'match' : 'match_result_case',
      entityId: player ? notification.matchId : notification.caseId,
      actionKind: notification.actionKind,
      actionExpiresAt: null,
      emailPolicy: 'required',
    },
  })));
}
