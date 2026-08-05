import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { searchVenues, filterAndSortVenues } from '../domain/search.js';
import { getAvailabilitySchedule } from '../domain/availability.js';
import { selectSlot } from '../domain/slotSelection.js';
import { createHold } from '../domain/hold.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

export const discoveryRouter = Router();

const searchSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radiusKm: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minPrice: z.coerce.number().optional(),
  sortBy: z.enum(['distance', 'price']).optional(),
  date: z.coerce.date().optional(),
  startMinute: z.coerce.number().optional(),
  endMinute: z.coerce.number().optional(),
});

// BOK-01 + BOK-02 — công khai, không cần đăng nhập.
discoveryRouter.get(
  '/search',
  h(async (req, res) => {
    const q = searchSchema.parse(req.query);
    const base = await searchVenues(q.lat, q.lng, q.radiusKm);
    const filtered = await filterAndSortVenues(base, {
      minPrice: q.minPrice,
      maxPrice: q.maxPrice,
      sortBy: q.sortBy,
      availability:
        q.date && q.startMinute !== undefined && q.endMinute !== undefined
          ? { date: q.date, startMinute: q.startMinute, endMinute: q.endMinute }
          : undefined,
    });
    res.status(200).json(
      filtered.map((r) => ({ ...r, lowestPrice: r.lowestPrice !== null ? r.lowestPrice.toString() : null })),
    );
  }),
);

const availabilitySchema = z.object({ date: z.coerce.date() });

// BOK-04 — công khai.
discoveryRouter.get(
  '/courts/:courtId/availability',
  h(async (req, res) => {
    const { date } = availabilitySchema.parse(req.query);
    const result = await getAvailabilitySchedule(req.params.courtId!, date);
    res.status(200).json({
      closed: result.closed,
      slots: result.slots.map((s) => ({ ...s, price: s.price !== null ? s.price.toString() : null })),
    });
  }),
);

const selectSchema = z.object({ startAt: z.coerce.date(), durationMinutes: z.number().int().positive() });

// BOK-05 — cần đăng nhập (AC-BOK-05-5).
discoveryRouter.post(
  '/courts/:courtId/select-slot',
  requireAuth,
  h(async (req, res) => {
    const { startAt, durationMinutes } = selectSchema.parse(req.body);
    const result = await selectSlot(req.params.courtId!, startAt, durationMinutes);
    res.status(200).json({ ...result, totalPrice: result.totalPrice.toString() });
  }),
);

const holdSchema = z.object({ courtId: z.string(), startAt: z.coerce.date(), endAt: z.coerce.date() });

// BOK-06 — cần đăng nhập.
discoveryRouter.post(
  '/holds',
  requireAuth,
  h(async (req, res) => {
    const input = holdSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const hold = await createHold(userId, input);
    res.status(201).json(hold);
  }),
);
