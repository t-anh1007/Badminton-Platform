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
