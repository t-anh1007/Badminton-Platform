import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { userNotificationRequestedSchema } from '@khoaluantn/shared';
import { notificationDeliveryAllowed } from '../src/domain/notifications.js';

const base = {
  recipient: { type: 'user' as const, userId: randomUUID(), targetRole: 'player' as const },
  category: 'booking' as const,
  title: 'Lịch đặt đã được hủy',
  body: 'Lịch đặt của bạn đã được hủy và hoàn 100%.',
  priority: 'update' as const,
  entityType: 'booking', entityId: randomUUID(),
  actionKind: 'booking.view' as const, actionExpiresAt: null,
};

describe('required shutdown notifications', () => {
  it('delivers a shutdown cancellation despite a disabled booking preference and carries the booking code', () => {
    const payload = userNotificationRequestedSchema.parse({
      ...base, kind: 'booking.shutdown_scheduled',
      deliveryPolicy: 'required', bookingBusinessCode: 'BK-00001234',
    });

    expect(notificationDeliveryAllowed(payload, false)).toBe(true);
    expect(payload.bookingBusinessCode).toBe('BK-00001234');
  });

  it('still honors a disabled booking preference for ordinary notifications', () => {
    const payload = userNotificationRequestedSchema.parse({ ...base, kind: 'booking.cancelled' });

    expect(notificationDeliveryAllowed(payload, false)).toBe(false);
  });

  it('rejects required delivery for a kind outside the approved whitelist', () => {
    expect(() => userNotificationRequestedSchema.parse({
      ...base, kind: 'booking.cancelled', deliveryPolicy: 'required',
    })).toThrow();
  });
});
