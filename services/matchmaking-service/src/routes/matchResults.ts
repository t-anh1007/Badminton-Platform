import { Router } from 'express';
import { z } from 'zod';
import { IMAGE_MIME_TYPES, type PrivateObjectStorageClient } from '@khoaluantn/object-storage';
import type { AccountClient } from '../clients/account.js';
import type { VenueBookingClient } from '../clients/venueBooking.js';
import { getPlayerResultCase, submitResultClaim } from '../domain/matchResults.js';
import { authorizeResultEvidenceUpload, readResultEvidence } from '../domain/resultEvidence.js';
import {
  confirmResult, decideAdminResult, getAdminResultCase, getProviderResultCase, listAdminResultCases, listProviderResultCases,
  objectResult, previewAdminDecision, reportIncident, submitProviderRecommendation, supplementResultEvidence,
} from '../domain/resultLifecycle.js';
import { requireAdmin, requireAuth, requirePlayer, requireProvider, type AuthenticatedRequest } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';
import { AppError } from '../lib/errors.js';

const matchIdSchema = z.string().uuid();
const checksumSchema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);
const uploadSchema = z.object({
  mimeType: z.enum(IMAGE_MIME_TYPES),
  size: z.number().int().positive(),
  checksumSha256: checksumSchema,
}).strict();
const evidenceSchema = z.array(z.object({
  objectKey: z.string().min(1).max(300),
  mimeType: z.enum(IMAGE_MIME_TYPES),
  checksumSha256: checksumSchema.optional(),
}).strict()).min(1).max(3);
const claimSchema = z.object({
  sets: z.array(z.object({ teamA: z.number().int(), teamB: z.number().int() }).strict()).min(1).max(5),
  evidence: evidenceSchema,
}).strict();

const objectionSchema = z.object({ reason: z.string().trim().min(1).max(1000), evidence: evidenceSchema }).strict();
const incidentSchema = z.object({
  type: z.enum(['no_show', 'not_played', 'interrupted', 'other']),
  description: z.string().trim().min(1).max(1000),
  evidence: evidenceSchema,
}).strict();
const supplementSchema = z.object({ evidence: evidenceSchema }).strict();

const outcomeSchema = z.enum(['TEAM_A_WIN', 'TEAM_B_WIN', 'NO_RESULT']);
const reasonSchema = z.string().trim().min(1).max(1000);
const queueSchema = z.object({
  status: z.enum(['declaration_open', 'provisional', 'incident_window', 'provider_review', 'admin_review', 'final']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
const recommendationSchema = z.object({ outcome: outcomeSchema, reason: reasonSchema }).strict();
const decisionSchema = z.object({
  outcome: outcomeSchema, reason: reasonSchema, caseVersion: z.number().int().positive(),
  previewToken: z.string().min(1).max(100), confirm: z.literal(true),
}).strict();

export function createMatchResultRouter(
  venueBookingClient: VenueBookingClient,
  accountClient: AccountClient,
  resolveStorage: () => PrivateObjectStorageClient,
) {
  const router = Router();
  const storage = () => {
    try {
      return resolveStorage();
    } catch {
      throw new AppError(503, 'OBJECT_STORAGE_UNAVAILABLE', 'Kho lưu trữ bằng chứng chưa sẵn sàng.');
    }
  };
  const viewer = (req: unknown) => (req as AuthenticatedRequest).user!;

  router.post('/:matchId/result-evidence/uploads', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = uploadSchema.parse(req.body);
    const upload = await authorizeResultEvidenceUpload(storage(), {
      ...input, matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id,
    });
    res.status(201).json({ upload });
  }));

  router.post('/:matchId/result-claims', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = claimSchema.parse(req.body);
    const claim = await submitResultClaim(storage(), {
      ...input, matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id,
    });
    res.status(201).json({ claim });
  }));

  router.post('/:matchId/result-responses/confirm', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const result = await confirmResult(matchIdSchema.parse(req.params.matchId), viewer(req).id);
    res.status(200).json({ result });
  }));

  router.post('/:matchId/result-responses/object', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = objectionSchema.parse(req.body);
    const objection = await objectResult(storage(), { ...input, matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id });
    res.status(201).json({ objection });
  }));

  router.post('/:matchId/incidents', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = incidentSchema.parse(req.body);
    const incident = await reportIncident(storage(), { ...input, matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id });
    res.status(201).json({ incident });
  }));

  router.post('/:matchId/result-evidence', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = supplementSchema.parse(req.body);
    await supplementResultEvidence(storage(), { ...input, matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id });
    res.status(204).end();
  }));

  router.get('/:matchId/result-case', requireAuth, withErrorHandling(async (req, res) => {
    const resultCase = await getPlayerResultCase(
      venueBookingClient, accountClient, matchIdSchema.parse(req.params.matchId), viewer(req).id,
    );
    res.status(200).json({ resultCase });
  }));

  router.get('/:matchId/result-evidence/:evidenceId/read', requireAuth, withErrorHandling(async (req, res) => {
    const read = await readResultEvidence(storage(), {
      matchId: matchIdSchema.parse(req.params.matchId),
      evidenceId: z.string().uuid().parse(req.params.evidenceId),
      viewer: { userId: viewer(req).id, roles: viewer(req).roles },
    });
    res.status(200).json(read);
  }));

  router.get('/provider/result-cases', requireAuth, requireProvider, withErrorHandling(async (req, res) => {
    res.status(200).json(await listProviderResultCases(venueBookingClient, viewer(req).id, queueSchema.parse(req.query)));
  }));

  router.get('/provider/result-cases/:caseId', requireAuth, requireProvider, withErrorHandling(async (req, res) => {
    const resultCase = await getProviderResultCase(venueBookingClient, accountClient, viewer(req).id, z.string().uuid().parse(req.params.caseId));
    res.status(200).json({ resultCase });
  }));

  router.post('/:matchId/provider-recommendation', requireAuth, requireProvider, withErrorHandling(async (req, res) => {
    const recommendation = await submitProviderRecommendation(
      viewer(req).id, matchIdSchema.parse(req.params.matchId), recommendationSchema.parse(req.body),
    );
    res.status(201).json({ recommendation });
  }));

  router.get('/admin/result-cases', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    res.status(200).json(await listAdminResultCases(venueBookingClient, queueSchema.parse(req.query)));
  }));

  router.get('/admin/result-cases/:caseId', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    const resultCase = await getAdminResultCase(venueBookingClient, accountClient, z.string().uuid().parse(req.params.caseId));
    res.status(200).json({ resultCase });
  }));

  router.post('/:matchId/admin-decision/preview', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    const preview = await previewAdminDecision(
      accountClient, viewer(req).id, matchIdSchema.parse(req.params.matchId), recommendationSchema.parse(req.body),
    );
    res.status(200).json({ preview });
  }));

  router.post('/:matchId/admin-decision', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    const { confirm: _confirmed, ...input } = decisionSchema.parse(req.body);
    const decision = await decideAdminResult(viewer(req).id, matchIdSchema.parse(req.params.matchId), input);
    res.status(201).json({ decision });
  }));

  return router;
}
