import { Router } from 'express';
import { z } from 'zod';
import { getPublicMatchProfile } from '../domain/profile.js';
import { h } from './handler.js';

export const internalRouter = Router();

internalRouter.get('/players/:userId/public-match-profile', h(async (req, res) => {
  const userId = z.string().uuid().parse(req.params.userId);
  res.status(200).json(await getPublicMatchProfile(userId));
}));
