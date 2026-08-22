import { Router } from 'express';
import { z } from 'zod';
import type { ObjectStorageClient } from '@khoaluantn/object-storage';
import { h } from './handler.js';
import { createVenue, updateVenue } from '../domain/venue.js';
import { addCourt, deactivateCourt, getCourtBookingHistory, updateCourt } from '../domain/court.js';
import { getVenueDetail } from '../domain/venueDetail.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

// Venue images are stored as [{ objectKey }] (or legacy strings). Turn them into
// browser-usable read URLs so the public detail page can render <img src>.
async function toImageUrls(images: unknown, storage: ObjectStorageClient): Promise<string[]> {
  if (!Array.isArray(images)) return [];
  const keys = images
    .map((image) =>
      typeof image === 'string'
        ? image
        : image && typeof image === 'object' && 'objectKey' in image
          ? String((image as { objectKey: unknown }).objectKey)
          : null,
    )
    .filter((key): key is string => !!key && key.trim().length > 0);
  // Key bắt đầu bằng "/" là asset tĩnh của frontend (apps/web/public), không
  // phải objectKey — trả nguyên xi, đừng map qua object storage.
  return Promise.all(keys.map((key) => (/^(?:https?:\/\/|\/)/i.test(key) ? Promise.resolve(key) : storage.getReadUrl(key))));
}

export function createVenueRouter(resolveStorage: () => ObjectStorageClient) {
  const venueRouter = Router();

  // BOK-03 — công khai, không cần đăng nhập.
  venueRouter.get(
    '/:id',
    h(async (req, res) => {
      const detail = await getVenueDetail(req.params.id!);
      const storage = resolveStorage();
      const images = await toImageUrls(detail.images, storage);
      const courts = await Promise.all(detail.courts.map(async (court) => ({ ...court, images: await toImageUrls(court.images, storage) })));
      res.status(200).json({ ...detail, images, courts });
    }),
  );

  const venueSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  address: z.string(),
  amenities: z.unknown().optional(),
  images: z.unknown().optional(),
});

venueRouter.post(
  '/',
  requireAuth,
  h(async (req, res) => {
    const input = venueSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const venue = await createVenue(userId, input);
    res.status(201).json(venue);
  }),
);

venueRouter.patch(
  '/:id',
  requireAuth,
  h(async (req, res) => {
    const input = venueSchema.partial().parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const venue = await updateVenue(userId, req.params.id!, input);
    res.status(200).json(venue);
  }),
);

const courtImageSchema = z.array(z.object({ objectKey: z.string().trim().min(1) }).strict()).min(1).max(5);
const courtSchema = z.object({ name: z.string(), images: courtImageSchema });

venueRouter.post(
  '/:venueId/courts',
  requireAuth,
  h(async (req, res) => {
    const { name, images } = courtSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const court = await addCourt(userId, req.params.venueId!, name, images);
    res.status(201).json(court);
  }),
);

venueRouter.patch(
  '/courts/:courtId',
  requireAuth,
  h(async (req, res) => {
    const input = z.object({ name: z.string().trim().min(1).optional(), images: courtImageSchema.optional() }).strict().parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const court = await updateCourt(userId, req.params.courtId!, input);
    res.status(200).json(court);
  }),
);

venueRouter.post(
  '/courts/:courtId/deactivate',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    await deactivateCourt(userId, req.params.courtId!);
    res.status(200).json({ message: 'Đã vô hiệu hóa sân.' });
  }),
);

venueRouter.get(
  '/courts/:courtId/bookings',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const history = await getCourtBookingHistory(userId, req.params.courtId!);
    res.status(200).json(history);
  }),
);

  return venueRouter;
}
