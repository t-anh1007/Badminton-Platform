import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { getUnifiedCalendar } from '../domain/calendar.js';
import { createInternalBooking, cancelInternalBooking } from '../domain/internalBooking.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

export const calendarRouter = Router();

const calendarQuerySchema = z.object({ date: z.coerce.date() });

calendarRouter.get(
  '/venues/:venueId/calendar',
  requireAuth,
  h(async (req, res) => {
    const { date } = calendarQuerySchema.parse(req.query);
    const userId = (req as AuthenticatedRequest).user!.id;
    const result = await getUnifiedCalendar(userId, req.params.venueId!, date);
    res.status(200).json(result);
  }),
);

const internalBookingSchema = z.object({
  courtId: z.string(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  guestName: z.string(),
  guestContact: z.string(),
});

calendarRouter.post(
  '/internal-bookings',
  requireAuth,
  h(async (req, res) => {
    const input = internalBookingSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const booking = await createInternalBooking(userId, input);
    res.status(201).json(booking);
  }),
);

calendarRouter.post(
  '/internal-bookings/:id/cancel',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    await cancelInternalBooking(userId, req.params.id!);
    res.status(200).json({ message: 'Đã hủy booking nội bộ.' });
  }),
);
