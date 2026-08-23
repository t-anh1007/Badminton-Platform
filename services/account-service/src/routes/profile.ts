import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { getOwnProfile, updateOwnProfile } from '../domain/profile.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { MAX_IMAGE_BYTES, type ObjectStorageClient } from '@khoaluantn/object-storage';

const avatarUploadSchema = z.object({ mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }).strict();
const avatarCommitSchema = z.object({ objectKey: z.string().min(1), mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }).strict();

export function createProfileRouter(resolveStorage: () => ObjectStorageClient) {
const profileRouter = Router();

profileRouter.get(
  '/me',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const profile = await getOwnProfile(userId, resolveStorage);
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

profileRouter.post('/me/avatar-upload', requireAuth, h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  const { mimeType } = avatarUploadSchema.parse(req.body);
  const upload = await resolveStorage().authorizeUpload({ namespace: 'profile/avatars', ownerUserId: userId, mimeType });
  res.status(201).json(upload);
}));

profileRouter.put('/me/avatar', requireAuth, h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  const { objectKey, mimeType } = avatarCommitSchema.parse(req.body);
  await resolveStorage().assertOwnedObject({ objectKey, namespace: 'profile/avatars', ownerUserId: userId, mimeType, maxBytes: MAX_IMAGE_BYTES });
  await updateOwnProfile(userId, { avatarUrl: objectKey });
  res.status(200).json(await getOwnProfile(userId, resolveStorage));
}));

return profileRouter;
}
