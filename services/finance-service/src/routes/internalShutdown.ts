import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getShutdownRefundPreview } from '../domain/shutdownPreview.js';
import { h } from './handler.js';

function requireInternalService(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  const actual = req.header('x-internal-service-token');
  if (!expected) {
    res.status(503).json({ error: { code: 'INTERNAL_SERVICE_AUTH_UNCONFIGURED', message: 'Chưa cấu hình xác thực service nội bộ.' } });
    return;
  }
  if (!actual || actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    res.status(401).json({ error: { code: 'INTERNAL_SERVICE_UNAUTHORIZED', message: 'Không được phép gọi lệnh nội bộ.' } });
    return;
  }
  next();
}

const requestSchema = z.object({ bookingIds: z.array(z.string().uuid()).max(500) }).strict();
export const internalShutdownRouter = Router();

internalShutdownRouter.post('/shutdown-refund-preview', requireInternalService, h(async (req, res) => {
  const { bookingIds } = requestSchema.parse(req.body);
  res.json({ amountByBookingId: await getShutdownRefundPreview([...new Set(bookingIds)]) });
}));
