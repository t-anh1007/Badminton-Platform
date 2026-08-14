import { Router } from 'express';
import { z } from 'zod';
import type { ObjectStorageClient } from '@khoaluantn/object-storage';
import { requireAuth, requirePlayer, type AuthenticatedRequest } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';

const uploadBody = z.object({ mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }).strict();

export function createCommunityUploadRouter(resolveStorage: () => ObjectStorageClient) {
  const router = Router();
  router.post('/uploads/posts', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const { mimeType } = uploadBody.parse(req.body);
    const upload = await resolveStorage().authorizeUpload({
      namespace: 'community/posts',
      ownerUserId: (req as AuthenticatedRequest).user!.id,
      mimeType,
    });
    res.status(201).json(upload);
  }));
  return router;
}
