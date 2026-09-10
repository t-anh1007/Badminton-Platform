import type { Response } from 'express';
import { markActivity } from '@khoaluantn/eventbus';

export type NotificationSignal = { eventId: string; notificationId: string | null; occurredAt: string };

const clients = new Map<string, Set<Response>>();
let heartbeat: NodeJS.Timeout | undefined;

function ensureHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    markActivity();
    for (const subscribers of clients.values()) for (const response of subscribers) response.write(': heartbeat\n\n');
  }, 25_000);
}

function stopHeartbeatWhenIdle() {
  if (clients.size !== 0 || !heartbeat) return;
  clearInterval(heartbeat);
  heartbeat = undefined;
}

export function subscribeNotificationSignals(userId: string, response: Response) {
  const subscribers = clients.get(userId) ?? new Set<Response>();
  subscribers.add(response);
  clients.set(userId, subscribers);
  ensureHeartbeat();
  response.write(': connected\n\n');
  return () => {
    subscribers.delete(response);
    if (subscribers.size === 0) clients.delete(userId);
    stopHeartbeatWhenIdle();
  };
}

export function publishNotificationSignal(userId: string, signal: NotificationSignal) {
  const frame = `id: ${signal.eventId}\nevent: notification-changed\ndata: ${JSON.stringify(signal)}\n\n`;
  for (const response of clients.get(userId) ?? []) response.write(frame);
}
