import { Router } from 'express';
import { z } from 'zod';
import type { ObjectStorageClient } from '@khoaluantn/object-storage';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { h } from './handler.js';

const uploadBody = z.object({ mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }).strict();

export function createVenueUploadRouter(resolveStorage: () => ObjectStorageClient) {
  const router = Router();
  router.post('/me/uploads', requireAuth, requireRole('provider'), h(async (req, res) => {
    const { mimeType } = uploadBody.parse(req.body);
    const upload = await resolveStorage().authorizeUpload({
      namespace: 'venue/images',
      ownerUserId: (req as AuthenticatedRequest).user!.id,
      mimeType,
    });
    res.status(201).json(upload);
  }));
  return router;
}
