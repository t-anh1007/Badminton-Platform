import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireInternalService } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';

export function createInternalRouter(): Router {
  const router = Router();
  // Chỉ để hiển thị mã KEO-… trên màn tài chính; không bao giờ dùng để cấp quyền hay chuyển tiền.
  router.post('/internal/matches/references', requireInternalService, withErrorHandling(async (req, res) => {
    const { matchIds } = z.object({ matchIds: z.array(z.string().uuid()).min(1).max(500) }).strict().parse(req.body);
    const references = await prisma.match.findMany({ where: { id: { in: matchIds } }, select: { id: true, businessCode: true } });
    res.json({ references });
  }));
  return router;
}
