import { Router } from 'express';
import { z } from 'zod';
import { vietnamProvinceCodeSchema } from '@khoaluantn/shared';
import {
  approveFinal, cancelProgram, createProgram, getAdminProgram, getPublicProgram, listAdminPrograms, listPublicPrograms, publishProgram,
} from '../domain/rewards.js';
import { optionalAuth, requireAdmin, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';
import type { AccountClient } from '../clients/account.js';

const createBody = z.object({
  name: z.string().trim().min(1).max(120),
  seasonId: z.string().uuid(),
  criterion: z.enum(['ending_rating', 'most_wins', 'largest_rating_gain', 'longest_streak']),
  discipline: z.enum(['singles', 'doubles']),
  band: z.enum(['under_1600', 'from_1600']),
  scope: z.enum(['global', 'province']),
  provinceCode: vietnamProvinceCodeSchema.optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  tiers: z.array(z.object({ rank: z.number().int().positive(), amount: z.string().regex(/^[1-9]\d*$/).transform(BigInt) }).strict()).min(1).max(50),
}).strict();
const adminList = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'scheduled', 'active', 'reconciling', 'awaiting_admin_approval', 'final', 'cancelled']).optional(),
});

/** BigInt tiền thưởng trả về dạng chuỗi. */
const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)));

export function createRewardRouter(accountClient: AccountClient) {
  const router = Router();
  const user = (req: unknown) => (req as AuthenticatedRequest).user;
  const id = (req: { params: Record<string, string> }) => z.string().uuid().parse(req.params.id);

  router.get('/programs', withErrorHandling(async (_req, res) => {
    res.status(200).json(await listPublicPrograms());
  }));

  router.get('/programs/:id', optionalAuth, withErrorHandling(async (req, res) => {
    res.status(200).json({ program: await getPublicProgram(id(req), user(req)?.id) });
  }));

  router.get('/admin/programs', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    res.status(200).json(await listAdminPrograms(adminList.parse(req.query)));
  }));

  router.get('/admin/programs/:id', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    res.status(200).json({ program: await getAdminProgram(accountClient, id(req)) });
  }));

  router.post('/admin/programs', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    res.status(201).json({ program: json(await createProgram(user(req)!.id, createBody.parse(req.body))) });
  }));

  router.post('/admin/programs/:id/publish', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    res.status(200).json({ program: json(await publishProgram(id(req))) });
  }));

  router.post('/admin/programs/:id/cancel', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(1).max(1000).optional() }).strict().parse(req.body);
    res.status(200).json({ program: json(await cancelProgram(id(req), reason)) });
  }));

  router.post('/admin/programs/:id/approve-final', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    z.object({ confirm: z.literal(true) }).strict().parse(req.body);
    res.status(200).json({ program: json(await approveFinal(id(req), user(req)!.id)) });
  }));

  return router;
}
