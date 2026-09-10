import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  getNotificationPreferences, listNotifications, listRecentNotifications, markAllNotificationsRead,
  markNotificationRead, saveNotificationPreference,
} from '../domain/notifications.js';
import { publishNotificationSignal, subscribeNotificationSignals } from '../lib/notificationRealtime.js';

const roleSchema = z.enum(['player', 'provider', 'admin']);
const categorySchema = z.enum(['booking', 'finance', 'match', 'dispute', 'support', 'security', 'community']);
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  role: roleSchema.optional(),
  unread: z.enum(['true', 'false']).optional(),
}).strict();
const preferenceSchema = z.object({ targetRole: roleSchema, category: categorySchema, enabled: z.boolean() }).strict();

function signal(userId: string, notificationId: string | null) {
  publishNotificationSignal(userId, { eventId: randomUUID(), notificationId, occurredAt: new Date().toISOString() });
}

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, h(async (req, res) => {
  const input = listSchema.parse(req.query);
  const userId = (req as AuthenticatedRequest).user!.id;
  res.status(200).json(await listNotifications(userId, { ...input, unread: input.unread === 'true' }));
}));

notificationsRouter.get('/recent', requireAuth, h(async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(5).default(5).parse(req.query.limit);
  res.status(200).json(await listRecentNotifications((req as AuthenticatedRequest).user!.id, limit));
}));

notificationsRouter.get('/preferences', requireAuth, h(async (req, res) => {
  res.status(200).json({ items: await getNotificationPreferences((req as AuthenticatedRequest).user!.id) });
}));

notificationsRouter.put('/preferences', requireAuth, h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  res.status(200).json(await saveNotificationPreference(userId, preferenceSchema.parse(req.body)));
  signal(userId, null);
}));

notificationsRouter.post('/read-all', requireAuth, h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  res.status(200).json(await markAllNotificationsRead(userId));
  signal(userId, null);
}));

notificationsRouter.post('/:notificationId/read', requireAuth, h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  const notificationId = z.string().uuid().parse(req.params.notificationId);
  res.status(200).json(await markNotificationRead(userId, notificationId));
  signal(userId, notificationId);
}));

notificationsRouter.get('/stream', requireAuth, (req, res) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const unsubscribe = subscribeNotificationSignals((req as AuthenticatedRequest).user!.id, res);
  req.on('close', unsubscribe);
});
