import { Router } from 'express';
import { z } from 'zod';
import type { VenueBookingClient } from '../clients/venueBooking.js';
import type { AccountClient } from '../clients/account.js';
import type { MatchmakerExplanationClient } from '@khoaluantn/ai';
import { createMatch, findPublicMatches, getPublicMatchDetail, requestJoin } from '../domain/matches.js';
import { suggestAiMatches } from '../domain/aiMatchmaker.js';
import { approveJoin, listPendingJoins, rejectJoin } from '../domain/joins.js';
import { optionalAuth, requireAdmin, requireAuth, requirePlayer, type AuthenticatedRequest } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';
import { cancelMatchByOrganizer, withdrawJoin } from '../domain/matchLifecycle.js';
import { listAdminEvaluations, reviewEvaluation, submitEvaluation } from '../domain/evaluations.js';

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
const normalizedCriteriaSchema = z.object({
  area: z.string().trim().min(1).optional(),
  startFrom: z.string().datetime({ offset: true }).optional(),
  endBefore: z.string().datetime({ offset: true }).optional(),
  feeMax: z.string().regex(/^\d+$/).optional(),
}).strict().refine((input) => !input.startFrom || !input.endBefore
  || new Date(input.startFrom) < new Date(input.endBefore), { message: 'startFrom must be before endBefore' });
export type NormalizedMatchCriteria = z.infer<typeof normalizedCriteriaSchema>;
const assistantChatSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  criteria: z.unknown().optional(),
}).strict();

function normalizeAssistantCriteria(input: unknown): NormalizedMatchCriteria {
  const parsed = normalizedCriteriaSchema.safeParse(input ?? {});
  return parsed.success ? parsed.data : {};
}

function inferCriteriaFromMessage(message: string): NormalizedMatchCriteria {
  const inferred: Record<string, string> = {};
  const area = message.match(/(?:ở|tại|khu vực)\s+([^,.;]+?)(?=\s+(?:dưới|tối đa|từ|sau|trước|đến)\b|[,.;]|$)/iu)?.[1]?.trim();
  if (area) inferred.area = area;
  const fee = message.match(/(?:dưới|tối đa)\s+([\d.\s]+)\s*(?:đ|vnd)(?:\s|$)/iu)?.[1]?.replace(/\D/g, '');
  if (fee) inferred.feeMax = fee;
  const isoDates = message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})/g) ?? [];
  if (isoDates[0]) inferred.startFrom = isoDates[0];
  if (isoDates[1]) inferred.endBefore = isoDates[1];
  return normalizeAssistantCriteria(inferred);
}

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

const evaluationSchema = z.object({
  rateeUserId: z.string().uuid(),
  perceivedTier: skillTier,
  labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
}).strict();

const evaluationReviewSchema = z.object({ decision: z.enum(['approve', 'reject']) }).strict();

export function createMatchRouter(
  venueBookingClient: VenueBookingClient,
  accountClient: AccountClient,
  matchmakerClient?: MatchmakerExplanationClient,
) {
  const router = Router();
  router.get('/admin/evaluations', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    const { reviewStatus } = z.object({
      reviewStatus: z.enum(['pending', 'approved', 'rejected']).default('pending'),
    }).parse(req.query);
    res.status(200).json({ evaluations: await listAdminEvaluations(reviewStatus) });
  }));
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
  router.get('/suggestions/ai', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const { skill: _ignoredSkill, ...filters } = searchSchema.parse(req.query);
    const userId = (req as AuthenticatedRequest).user!.id;
    const suggestions = await suggestAiMatches(venueBookingClient, userId, filters, matchmakerClient);
    res.status(200).json({ suggestions });
  }));
  router.post('/suggestions/ai/chat', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = assistantChatSchema.parse(req.body);
    const inferredCriteria = inferCriteriaFromMessage(input.message);
    const suppliedCriteria = normalizeAssistantCriteria(input.criteria);
    const normalizedCriteria = normalizeAssistantCriteria({ ...inferredCriteria, ...suppliedCriteria });
    const criteria = {
      ...normalizedCriteria,
      startFrom: normalizedCriteria.startFrom ? new Date(normalizedCriteria.startFrom) : undefined,
      endBefore: normalizedCriteria.endBefore ? new Date(normalizedCriteria.endBefore) : undefined,
      feeMax: normalizedCriteria.feeMax ? BigInt(normalizedCriteria.feeMax) : undefined,
      minOpenSlots: 1,
    };
    const userId = (req as AuthenticatedRequest).user!.id;
    const suggestions = await suggestAiMatches(venueBookingClient, userId, criteria, matchmakerClient);
    const asksForAction = /(tham gia|vào kèo|join|đặt sân|thanh toán|hủy)/iu.test(input.message);
    const answer = asksForAction
      ? `Tìm thấy ${suggestions.length} kèo theo F-02. Tôi không tự thực hiện hành động; hãy mở danh sách kèo để kiểm tra và xác nhận.`
      : suggestions.length ? `Tìm thấy ${suggestions.length} kèo phù hợp theo F-02.` : 'Chưa có kèo phù hợp.';
    res.status(200).json({
      answer,
      normalizedCriteria,
      suggestions,
      ...(asksForAction ? { actionPath: '/matches' } : {}),
    });
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
  router.post('/:matchId/evaluations', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const matchId = z.string().uuid().parse(req.params.matchId);
    const input = evaluationSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(201).json(await submitEvaluation({ matchId, raterUserId: userId, ...input }));
  }));
  router.patch('/:matchId/evaluations/:evaluationId/review', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    const matchId = z.string().uuid().parse(req.params.matchId);
    const evaluationId = z.string().uuid().parse(req.params.evaluationId);
    const input = evaluationReviewSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(200).json(await reviewEvaluation(matchId, evaluationId, userId, input.decision));
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
