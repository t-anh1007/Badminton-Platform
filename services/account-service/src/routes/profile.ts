import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { getOwnProfile, updateOwnProfile } from '../domain/profile.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

export const profileRouter = Router();

profileRouter.get(
  '/me',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const profile = await getOwnProfile(userId);
    res.status(200).json(profile);
  }),
);

// .strict(): AC-ACC-07-2 — email (hay bất kỳ trường lạ nào) không nằm trong
// schema này; gọi API trực tiếp kèm "email" phải bị TỪ CHỐI rõ ràng (400),
// không chỉ âm thầm bỏ qua.
const updateSchema = z
  .object({
    displayName: z.string().optional(),
    avatarUrl: z.string().optional(),
    phone: z.string().optional(),
    visibility: z.enum(['public', 'private']).optional(),
  })
  .strict();

profileRouter.patch(
  '/me',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const input = updateSchema.parse(req.body);
    const updated = await updateOwnProfile(userId, input);
    res.status(200).json(updated);
  }),
);
