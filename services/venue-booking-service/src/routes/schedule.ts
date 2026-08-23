import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { setOperatingHours, replaceOperatingHours, addClosure } from '../domain/schedule.js';
import { savePricingRules } from '../domain/pricing.js';
import { setBookingRule } from '../domain/bookingRule.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

export const scheduleRouter = Router();

const hoursSchema = z.object({ weekday: z.number().int().min(0).max(6), openMinute: z.number().int(), closeMinute: z.number().int() });

scheduleRouter.post(
  '/courts/:courtId/operating-hours',
  requireAuth,
  h(async (req, res) => {
    const { weekday, openMinute, closeMinute } = hoursSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const result = await setOperatingHours(userId, req.params.courtId!, weekday, openMinute, closeMinute);
    res.status(200).json(result);
  }),
);

scheduleRouter.put(
  '/courts/:courtId/operating-hours',
  requireAuth,
  h(async (req, res) => {
    const { hours } = z.object({ hours: z.array(hoursSchema).min(1).max(7) }).strict().parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const result = await replaceOperatingHours(userId, req.params.courtId!, hours);
    res.status(200).json(result);
  }),
);

const closureSchema = z.object({ date: z.coerce.date(), reason: z.string().optional() });

scheduleRouter.post(
  '/courts/:courtId/closures',
  requireAuth,
  h(async (req, res) => {
    const { date, reason } = closureSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const result = await addClosure(userId, req.params.courtId!, date, reason);
    res.status(200).json(result);
  }),
);

const pricingSchema = z.object({
  rules: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      startMinute: z.number().int(),
      endMinute: z.number().int(),
      price: z.number(),
    }),
  ),
  effectiveFrom: z.coerce.date(),
});

scheduleRouter.post(
  '/courts/:courtId/pricing',
  requireAuth,
  h(async (req, res) => {
    const { rules, effectiveFrom } = pricingSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const result = await savePricingRules(userId, req.params.courtId!, rules, effectiveFrom);
    res.status(200).json(result);
  }),
);

const bookingRuleSchema = z.object({
  stepMinutes: z.number().int().positive(),
  minDurationMinutes: z.number().int().positive(),
  maxDurationMinutes: z.number().int().positive(),
});

scheduleRouter.post(
  '/courts/:courtId/booking-rule',
  requireAuth,
  h(async (req, res) => {
    const { stepMinutes, minDurationMinutes, maxDurationMinutes } = bookingRuleSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const result = await setBookingRule(userId, req.params.courtId!, stepMinutes, minDurationMinutes, maxDurationMinutes);
    res.status(200).json(result);
  }),
);
