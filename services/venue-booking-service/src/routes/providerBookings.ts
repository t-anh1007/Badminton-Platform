import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { getProviderBookingDetail, listProviderBookings } from '../domain/providerBooking.js';

export const providerBookingRouter = Router();

const querySchema = z.object({
  query: z.string().trim().max(120).optional(),
  venueId: z.string().uuid().optional(),
  courtId: z.string().uuid().optional(),
  status: z.enum(['held', 'confirmed', 'completed', 'cancelled']).optional(),
  timeScope: z.enum(['all', 'past', 'current', 'future']).default('all'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

providerBookingRouter.get(
  '/providers/me/bookings',
  requireAuth,
  requireRole('provider'),
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    res.json(await listProviderBookings(userId, querySchema.parse(req.query)));
  }),
);

providerBookingRouter.get(
  '/providers/me/bookings/:id',
  requireAuth,
  requireRole('provider'),
  h(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const userId = (req as AuthenticatedRequest).user!.id;
    res.json(await getProviderBookingDetail(userId, id));
  }),
);
