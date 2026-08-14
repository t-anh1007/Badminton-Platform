import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { listAdminAccounts, lockAccount, unlockAccount } from '../domain/adminAccounts.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';

export const adminRouter = Router();
adminRouter.get('/users', requireAuth, requireRole('admin'), h(async (req, res) => res.json(await listAdminAccounts(z.object({ query: z.string().optional(), status: z.enum(['active', 'locked']).optional() }).parse(req.query)))));

const reasonSchema = z.object({ reason: z.string() });

adminRouter.post(
  '/users/:id/lock',
  requireAuth,
  requireRole('admin'),
  h(async (req, res) => {
    const { reason } = reasonSchema.parse(req.body);
    const adminId = (req as AuthenticatedRequest).user!.id;
    await lockAccount(adminId, req.params.id!, reason);
    res.status(200).json({ message: 'Đã khóa tài khoản.' });
  }),
);

adminRouter.post(
  '/users/:id/unlock',
  requireAuth,
  requireRole('admin'),
  h(async (req, res) => {
    const { reason } = reasonSchema.parse(req.body);
    const adminId = (req as AuthenticatedRequest).user!.id;
    await unlockAccount(adminId, req.params.id!, reason);
    res.status(200).json({ message: 'Đã khôi phục tài khoản.' });
  }),
);
