import { Router } from 'express';
import { markActivity, watchAccountLock } from '@khoaluantn/eventbus';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import type { FinanceRealtimeHub } from '../realtime/financeRealtimeHub.js';

export function createFinanceRealtimeRouter(hub: FinanceRealtimeHub) {
  const router = Router();
  router.get('/providers/me/finance-stream', requireAuth, requireRole('provider'), (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('event: ready\ndata: {}\n\n');
    const unsubscribe = hub.subscribe(userId, (chunk) => res.write(chunk));
    const heartbeat = setInterval(() => {
      markActivity();
      res.write(': heartbeat\n\n');
    }, 15_000);
    // Tài khoản bị khóa trong lúc đang mở luồng: cắt ngay.
    const stopLockWatch = watchAccountLock(userId, () => res.end());
    req.on('close', () => {
      clearInterval(heartbeat);
      stopLockWatch();
      unsubscribe();
    });
  });
  return router;
}
