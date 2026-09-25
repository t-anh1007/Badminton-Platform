import { Router } from 'express';
import { z } from 'zod';
import { declareTier, getOwnPassport, getPublicPassport } from '../domain/passport.js';
import { requireAuth, requirePlayer, type AuthenticatedRequest } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';
import { getMatchHistory } from '../domain/leaderboards.js';
import type { AccountClient } from '../clients/account.js';

export function createPassportRouter(accountClient: AccountClient) {
const passportRouter = Router();

const declarationSchema = z.object({
  discipline: z.enum(['singles', 'doubles']),
  tier: z.enum(['newcomer', 'beginner', 'intermediate', 'intermediate_plus', 'advanced']),
}).strict();

passportRouter.put(
  '/me/declaration',
  requireAuth,
  requirePlayer,
  withErrorHandling(async (req, res) => {
    const input = declarationSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    await declareTier(userId, input.discipline, input.tier);
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
  '/me/matches',
  requireAuth,
  requirePlayer,
  withErrorHandling(async (req, res) => {
    const input = z.object({
      discipline: z.enum(['singles', 'doubles']),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(req.query);
    res.status(200).json(await getMatchHistory(accountClient, (req as AuthenticatedRequest).user!.id, input));
  }),
);

passportRouter.get(
  '/:userId',
  withErrorHandling(async (req, res) => {
    const userId = z.string().uuid().parse(req.params.userId);
    const [passport, identity] = await Promise.all([
      getPublicPassport(userId),
      accountClient.getPublicMatchProfile(userId).catch(() => null),
    ]);
    res.status(200).json({
      ...passport,
      displayName: identity?.identityVisibility === 'public' ? identity.displayName : 'Người chơi',
      avatarUrl: identity?.identityVisibility === 'public' ? identity.avatarUrl : null,
      identityVisibility: identity?.identityVisibility ?? 'hidden',
    });
  }),
);

return passportRouter;
}
