import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { createVenue, updateVenue } from '../domain/venue.js';
import { addCourt, deactivateCourt, getCourtBookingHistory } from '../domain/court.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

export const venueRouter = Router();

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

const courtSchema = z.object({ name: z.string() });

venueRouter.post(
  '/:venueId/courts',
  requireAuth,
  h(async (req, res) => {
    const { name } = courtSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const court = await addCourt(userId, req.params.venueId!, name);
    res.status(201).json(court);
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
