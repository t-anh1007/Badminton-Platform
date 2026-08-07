import { Router } from 'express';
import { z } from 'zod';
import { declareTier, getOwnPassport, getPublicPassport } from '../domain/passport.js';
import { requireAuth, requirePlayer, type AuthenticatedRequest } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';

export const passportRouter = Router();

const declarationSchema = z.object({
  tier: z.enum(['newcomer', 'beginner', 'intermediate', 'intermediate_plus', 'advanced']),
}).strict();

passportRouter.put(
  '/me/declaration',
  requireAuth,
  requirePlayer,
  withErrorHandling(async (req, res) => {
    const input = declarationSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    await declareTier(userId, input.tier);
    res.status(200).json(await getOwnPassport(userId));
  }),
);

passportRouter.get(
  '/me',
  requireAuth,
  requirePlayer,
  withErrorHandling(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(200).json(await getOwnPassport(userId));
  }),
);

passportRouter.get(
  '/:userId',
  withErrorHandling(async (req, res) => {
    const userId = z.string().uuid().parse(req.params.userId);
    res.status(200).json(await getPublicPassport(userId));
  }),
);
