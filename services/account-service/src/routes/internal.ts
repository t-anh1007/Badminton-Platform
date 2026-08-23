import { Router, json } from 'express';
import { z } from 'zod';
import { getPublicDisplayNames, getPublicMatchProfile } from '../domain/profile.js';
import { h } from './handler.js';
import type { ObjectStorageClient } from '@khoaluantn/object-storage';

export function createInternalRouter(resolveStorage: () => ObjectStorageClient) {
const internalRouter = Router();

internalRouter.get('/players/:userId/public-match-profile', h(async (req, res) => {
  const userId = z.string().uuid().parse(req.params.userId);
  res.status(200).json(await getPublicMatchProfile(userId, resolveStorage));
}));

const batchSchema = z.object({ userIds: z.array(z.string().uuid()).max(200) }).strict();
internalRouter.post('/players/public-display-names', json(), h(async (req, res) => {
  const { userIds } = batchSchema.parse(req.body);
  res.status(200).json({ profiles: await getPublicDisplayNames(userIds, resolveStorage) });
}));

return internalRouter;
}
