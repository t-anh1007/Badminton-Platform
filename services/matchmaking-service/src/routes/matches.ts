import { Router } from 'express';
import { z } from 'zod';
import type { VenueBookingClient } from '../clients/venueBooking.js';
import type { AccountClient } from '../clients/account.js';
import { createMatch, findPublicMatches, getPublicMatchDetail, requestJoin } from '../domain/matches.js';
import { approveJoin, listPendingJoins, rejectJoin } from '../domain/joins.js';
import { optionalAuth, requireAuth, requirePlayer, type AuthenticatedRequest } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';
import { cancelMatchByOrganizer, withdrawJoin } from '../domain/matchLifecycle.js';

const skillTier = z.enum(['newcomer', 'beginner', 'intermediate', 'intermediate_plus', 'advanced']);
const searchSchema = z.object({
  skill: skillTier.optional(),
  area: z.string().trim().min(1).optional(),
  startFrom: z.coerce.date().optional(),
  endBefore: z.coerce.date().optional(),
  feeMax: z.string().regex(/^\d+$/).transform(BigInt).optional(),
  minOpenSlots: z.coerce.number().int().min(1).default(1),
}).refine((input) => !input.startFrom || !input.endBefore || input.startFrom < input.endBefore, {
  message: 'startFrom must be before endBefore',
});

const createSchema = z.object({
  bookingId: z.string().uuid().optional(),
  holdId: z.string().uuid().optional(),
  capacity: z.number().int().min(2),
  feeMode: z.enum(['free', 'split']),
  skillMin: skillTier.optional(),
  skillMax: skillTier.optional(),
}).strict().refine((input) => Boolean(input.bookingId) !== Boolean(input.holdId), {
  message: 'Provide exactly one of bookingId or holdId',
}).refine((input) => !input.skillMin || !input.skillMax
  || skillTier.options.indexOf(input.skillMin) <= skillTier.options.indexOf(input.skillMax), {
  message: 'skillMin must not exceed skillMax',
});

export function createMatchRouter(venueBookingClient: VenueBookingClient, accountClient: AccountClient) {
  const router = Router();
  router.post('/', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = createSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const match = await createMatch(
      venueBookingClient,
      userId,
      req.headers.authorization!,
      input,
    );
    res.status(201).json({ ...match, feePerSlot: match.feePerSlot.toString() });
  }));
  router.get('/', withErrorHandling(async (req, res) => {
    const filters = searchSchema.parse(req.query);
    res.status(200).json({ matches: await findPublicMatches(venueBookingClient, filters) });
  }));
  router.post('/:matchId/joins', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const matchId = z.string().uuid().parse(req.params.matchId);
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(201).json(await requestJoin(matchId, userId));
  }));
  router.get('/:matchId/joins/pending', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const matchId = z.string().uuid().parse(req.params.matchId);
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(200).json({ joins: await listPendingJoins(matchId, userId) });
  }));
  router.post('/:matchId/joins/:joinId/approve', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const matchId = z.string().uuid().parse(req.params.matchId);
    const joinId = z.string().uuid().parse(req.params.joinId);
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(200).json(await approveJoin(matchId, joinId, userId));
  }));
  router.post('/:matchId/joins/:joinId/reject', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const matchId = z.string().uuid().parse(req.params.matchId);
    const joinId = z.string().uuid().parse(req.params.joinId);
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(200).json(await rejectJoin(matchId, joinId, userId));
  }));
  router.post('/:matchId/joins/:joinId/withdraw', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const matchId = z.string().uuid().parse(req.params.matchId);
    const joinId = z.string().uuid().parse(req.params.joinId);
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(200).json(await withdrawJoin(venueBookingClient, matchId, joinId, userId));
  }));
  router.post('/:matchId/cancel', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const matchId = z.string().uuid().parse(req.params.matchId);
    const userId = (req as AuthenticatedRequest).user!.id;
    const match = await cancelMatchByOrganizer(
      venueBookingClient,
      matchId,
      userId,
      req.headers.authorization!,
    );
    res.status(200).json({ ...match, feePerSlot: match.feePerSlot.toString() });
  }));
  router.get('/:matchId', optionalAuth, withErrorHandling(async (req, res) => {
    const matchId = z.string().uuid().parse(req.params.matchId);
    res.status(200).json(await getPublicMatchDetail(
      venueBookingClient,
      accountClient,
      matchId,
      (req as AuthenticatedRequest).user,
    ));
  }));
  return router;
}
