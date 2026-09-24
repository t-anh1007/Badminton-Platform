import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { projectNotification } from '../src/domain/notifications.js';
import { userNotificationRequestedSchema } from '@khoaluantn/shared';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('shutdown notification projection', () => {
  it('persists a required cancellation despite an opted-out preference and deduplicates delivery', async () => {
    const user = await prisma.user.create({ data: {
      email: `shutdown-${randomUUID()}@example.test`,
      roles: ['player'],
    } });
    const sourceEventId = `shutdown:${randomUUID()}`;
    const bookingBusinessCode = 'BK-00004220';
    try {
      await prisma.notificationPreference.create({
        data: { userId: user.id, targetRole: 'player', category: 'booking', enabled: false },
      });
      const payload = userNotificationRequestedSchema.parse({
        recipient: { type: 'user', userId: user.id, targetRole: 'player' },
        category: 'booking',
        kind: 'booking.shutdown_emergency',
        deliveryPolicy: 'required',
        bookingBusinessCode,
        title: 'Lịch đặt đã được hủy',
        body: `Lịch ${bookingBusinessCode} đã hủy do sự cố. Bạn được hoàn 100% nếu đã thanh toán.`,
        priority: 'update', entityType: 'booking', entityId: randomUUID(),
        actionKind: 'booking.view', actionExpiresAt: null,
      });

      const first = await projectNotification(sourceEventId, payload);
      const replay = await projectNotification(sourceEventId, payload);
      const stored = await prisma.notification.findMany({ where: { sourceEventId, userId: user.id } });

      expect(first).toHaveLength(1);
      expect(replay).toHaveLength(1);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ kind: payload.kind, bookingBusinessCode });
      expect(first[0]?.notification.bookingBusinessCode).toBe(bookingBusinessCode);
    } finally {
      await prisma.notification.deleteMany({ where: { sourceEventId } });
      await prisma.notificationPreference.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
