import { Router } from 'express';
import { z } from 'zod';
import { vietnamProvinceCodeSchema } from '@khoaluantn/shared';
import {
  closeSeason, createSeason, getCurrentSeason, listSeasons, selectSeasonRegion, updateSeason,
} from '../domain/seasons.js';
import { optionalAuth, requireAdmin, requireAuth, requirePlayer, type AuthenticatedRequest } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';
import type { AccountClient } from '../clients/account.js';
import { getLeaderboard } from '../domain/leaderboards.js';

const seasonBody = z.object({
  name: z.string().trim().min(1).max(80),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
}).strict();
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const leaderboardQuery = z.object({
  seasonId: z.string().uuid().optional(),
  discipline: z.enum(['singles', 'doubles']),
  scope: z.enum(['global', 'province']).default('global'),
  provinceCode: vietnamProvinceCodeSchema.optional(),
  band: z.enum(['under_1600', 'from_1600']),
}).merge(pagination);

export function createCompetitionRouter(accountClient: AccountClient) {
  const router = Router();
  const user = (req: unknown) => (req as AuthenticatedRequest).user;

  router.get('/leaderboards', optionalAuth, withErrorHandling(async (req, res) => {
    res.status(200).json(await getLeaderboard(accountClient, leaderboardQuery.parse(req.query), user(req)?.id));
  }));

  router.get('/seasons/current', optionalAuth, withErrorHandling(async (req, res) => {
    res.status(200).json(await getCurrentSeason(user(req)?.id));
  }));

  router.put('/seasons/current/me/region', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const { provinceCode } = z.object({ provinceCode: vietnamProvinceCodeSchema }).strict().parse(req.body);
    const profile = await selectSeasonRegion(user(req)!.id, provinceCode);
    res.status(200).json({ seasonId: profile.seasonId, provinceCode: profile.provinceCode, lockedAt: profile.lockedAt });
  }));

  router.get('/admin/seasons', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    res.status(200).json(await listSeasons(pagination.parse(req.query)));
  }));

  router.post('/admin/seasons', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    res.status(201).json({ season: await createSeason(seasonBody.parse(req.body)) });
  }));

  router.patch('/admin/seasons/:id', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    const input = seasonBody.partial().parse(req.body);
    res.status(200).json({ season: await updateSeason(z.string().uuid().parse(req.params.id), input) });
  }));

  router.post('/admin/seasons/:id/close', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    res.status(200).json({ season: await closeSeason(z.string().uuid().parse(req.params.id)) });
  }));

  return router;
}
