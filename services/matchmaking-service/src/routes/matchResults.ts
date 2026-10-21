import { Router } from 'express';
import { z } from 'zod';
import { IMAGE_MIME_TYPES, type PrivateObjectStorageClient } from '@khoaluantn/object-storage';
import type { AccountClient } from '../clients/account.js';
import type { VenueBookingClient } from '../clients/venueBooking.js';
import { getPlayerResultCase, submitResultClaim } from '../domain/matchResults.js';
import { authorizeResultEvidenceUpload, inspectResultEvidence, readResultEvidence, resultRosterUserIds } from '../domain/resultEvidence.js';
import { readUploads } from '../domain/resultOcr.js';
import { confirmV2, objectV2, reportIncidentV2, submitClaimV2 } from '../domain/resultClaimsV2.js';
import {
  acceptRuling, closeEvidenceWindow, markEvidenceDone, openEvidenceWindow, recordPrecedent, submitAppeal, submitDisputeEvidence,
} from '../domain/resultDisputeV2.js';
import { resultCaseViewV2 } from '../domain/resultCaseViewV2.js';
import { sweepAllResultDeadlines } from '../domain/resultSweepV2.js';
import { prisma } from '../lib/prisma.js';
import type { AiChains } from '../lib/aiClients.js';
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
const resultUploadsSchema = z.object({
  items: z.array(z.object({
    objectKey: z.string().min(1).max(300),
    mimeType: z.enum(IMAGE_MIME_TYPES),
    checksumSha256: checksumSchema,
  }).strict()).min(1).max(5),
}).strict();
const setsSchema = z.array(z.object({ teamA: z.number().int(), teamB: z.number().int() }).strict()).min(1).max(5);
const submissionSchema = z.object({
  draftId: z.string().uuid(),
  sets: setsSchema,
  columnMapping: z.enum(['left_is_A', 'left_is_B']).nullable(),
  editedCells: z.array(z.object({ set: z.number().int().min(0).max(4), side: z.enum(['A', 'B']) }).strict()).max(10),
});
// Không strict: trường lạ (vd `level` do FE tự gửi) bị bỏ qua, server tự tính mức.
const claimV2Schema = submissionSchema.extend({ outcome: z.literal('NO_RESULT').optional() });
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
const objectionV2Schema = z.object({
  reason: z.enum(['score_wrong', 'no_match']),
  note: z.string().trim().min(1).max(1000).optional(),
  claimVersion: z.number().int().positive(),
  /** Ảnh kèm theo: bản nháp đã tải qua /result-uploads (bắt buộc với người uy tín Thấp). */
  submission: submissionSchema.strict().optional(),
}).strict();
const incidentV2Schema = z.object({
  type: z.enum(['no_show', 'not_played', 'interrupted', 'other']),
  description: z.string().trim().min(1).max(1000),
  evidence: evidenceSchema.optional(),
}).strict();

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
  appealGrounded: z.boolean().optional(),
  violations: z.array(z.object({ userId: z.string().uuid(), kind: z.string().trim().min(1).max(60) }).strict()).max(4).optional(),
}).strict();
const appealSchema = z.object({
  rulingId: z.string().uuid(),
  reason: reasonSchema,
  pointedReason: z.string().trim().min(1).max(1000).optional(),
  evidence: z.array(z.object({
    objectKey: z.string().min(1).max(300), mimeType: z.enum(IMAGE_MIME_TYPES), checksumSha256: checksumSchema.optional(),
  }).strict()).max(2).optional(),
}).strict();

export function createMatchResultRouter(
  venueBookingClient: VenueBookingClient,
  accountClient: AccountClient,
  resolveStorage: () => PrivateObjectStorageClient,
  aiChains: AiChains,
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

  // T1: đọc ảnh đồng bộ (tối đa ~30 giây) rồi trả bản nháp; AI lỗi thì bản nháp gõ tay.
  router.post('/:matchId/result-uploads', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = resultUploadsSchema.parse(req.body);
    const result = await readUploads(
      { ...input, matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id },
      { storage: storage(), ai: aiChains, accountClient },
    );
    res.status(200).json(result);
  }));

  /** T8: hồ sơ legacy chạy nguyên luật cũ; hồ sơ ra_v1 dùng luồng ảnh. */
  const rulesOf = async (matchId: string) => (await prisma.matchResultCase.findUnique({
    where: { matchId }, select: { rulesVersion: true },
  }))?.rulesVersion ?? null;

  router.post('/:matchId/result-claims', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const matchId = matchIdSchema.parse(req.params.matchId);
    if (await rulesOf(matchId) === 'ra_v1') {
      const claim = await submitClaimV2(
        { ...claimV2Schema.parse(req.body), matchId, userId: viewer(req).id },
        { accountClient, openDispute: openEvidenceWindow },
      );
      res.status(201).json({ claim });
      return;
    }
    const input = claimSchema.parse(req.body);
    const claim = await submitResultClaim(storage(), {
      ...input, matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id,
    });
    res.status(201).json({ claim });
  }));

  router.post('/:matchId/result-responses/confirm', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const matchId = matchIdSchema.parse(req.params.matchId);
    if (await rulesOf(matchId) === 'ra_v1') {
      const { claimVersion } = z.object({ claimVersion: z.number().int().positive() }).parse(req.body);
      res.status(200).json({ result: await confirmV2({ matchId, userId: viewer(req).id, claimVersion }) });
      return;
    }
    const result = await confirmResult(matchId, viewer(req).id);
    res.status(200).json({ result });
  }));

  router.post('/:matchId/result-responses/object', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const matchId = matchIdSchema.parse(req.params.matchId);
    if (await rulesOf(matchId) === 'ra_v1') {
      const input = objectionV2Schema.parse(req.body);
      const objection = await objectV2(
        { ...input, matchId, userId: viewer(req).id },
        { accountClient, openDispute: openEvidenceWindow },
      );
      res.status(201).json({ objection });
      return;
    }
    const input = objectionSchema.parse(req.body);
    const objection = await objectResult(storage(), { ...input, matchId, userId: viewer(req).id });
    res.status(201).json({ objection });
  }));

  router.post('/:matchId/incidents', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const matchId = matchIdSchema.parse(req.params.matchId);
    // Hồ sơ chưa mở (sự cố trước/trong trận) sẽ là ra_v1 → đi thẳng Admin (BR-RA-42).
    if (await rulesOf(matchId) !== 'legacy') {
      const input = incidentV2Schema.parse(req.body);
      const evidence = input.evidence ? await inspectResultEvidence(storage(), viewer(req).id, input.evidence) : undefined;
      const incident = await reportIncidentV2({ ...input, evidence, matchId, userId: viewer(req).id });
      res.status(201).json({ incident });
      return;
    }
    const input = incidentSchema.parse(req.body);
    const incident = await reportIncident(storage(), { ...input, matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id });
    res.status(201).json({ incident });
  }));

  router.post('/:matchId/result-evidence', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = supplementSchema.parse(req.body);
    await supplementResultEvidence(storage(), { ...input, matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id });
    res.status(204).end();
  }));

  // BR-RA-30: ảnh tranh chấp trong 2 giờ (bản nháp từ /result-uploads), giữ kín với đội kia.
  router.post('/:matchId/result-evidence/dispute', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = submissionSchema.strict().parse(req.body);
    const submission = await submitDisputeEvidence(
      { ...input, matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id }, { accountClient },
    );
    res.status(201).json({ submission });
  }));

  router.post('/:matchId/result-evidence/done', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const now = new Date();
    const evidenceStorage = storage();
    const done = await markEvidenceDone(matchIdSchema.parse(req.params.matchId), viewer(req).id, now);
    // Hai đội đã nộp đủ: đóng sớm và xử tầng 1 ngay (đọc lại ảnh nếu cần), không chờ sweeper.
    const tier1 = done.bothTeamsDone
      ? await closeEvidenceWindow(done.caseId, { ai: aiChains, storage: evidenceStorage, now: () => now })
      : null;
    res.status(200).json({ bothTeamsDone: done.bothTeamsDone, tier1 });
  }));

  router.post('/:matchId/result-appeals', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = appealSchema.parse(req.body);
    const appeal = await submitAppeal({ ...input, matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id }, { storage: storage() });
    res.status(201).json({ appeal });
  }));

  router.post('/:matchId/result-rulings/:rulingId/accept', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const result = await acceptRuling({
      matchId: matchIdSchema.parse(req.params.matchId), userId: viewer(req).id, rulingId: z.string().uuid().parse(req.params.rulingId),
    });
    res.status(200).json({ result });
  }));

  router.get('/:matchId/result-case', requireAuth, withErrorHandling(async (req, res) => {
    const matchId = matchIdSchema.parse(req.params.matchId);
    const now = new Date();
    // Quét lười: service ngủ (Railway) thì hạn vẫn được xử lý khi có người mở hồ sơ (tech design §4.2).
    // Chỉ roster kích hoạt được (quét có thể đọc lại ảnh bằng AI); người ngoài vẫn nhận 403 từ bước đọc bên dưới.
    if ((await resultRosterUserIds(prisma, matchId)).includes(viewer(req).id)) {
      await sweepAllResultDeadlines(now, [matchId], { ai: aiChains, storage });
    }
    const resultCase = await getPlayerResultCase(venueBookingClient, accountClient, matchId, viewer(req).id, now);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, include: { resultCase: true } });
    if (match.resultCase?.rulesVersion !== 'ra_v1') {
      res.status(200).json({ resultCase });
      return;
    }
    res.status(200).json({ resultCase: { ...resultCase, ...await resultCaseViewV2(match.resultCase, match, viewer(req).id, now) } });
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
    // BR-RA-63: quyết định Admin của hồ sơ ra_v1 thành án lệ ẩn danh; lỗi nạp án lệ không làm hỏng quyết định đã ghi.
    const decided = await prisma.adminResultDecision.findUniqueOrThrow({ where: { id: decision.decisionId }, select: { caseId: true } });
    await recordPrecedent(decided.caseId, { ai: aiChains }).catch((error) => console.error('[precedent]', error));
    res.status(201).json({ decision });
  }));

  return router;
}
