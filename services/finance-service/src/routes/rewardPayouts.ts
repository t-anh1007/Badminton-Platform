import { Router } from 'express';
import { z } from 'zod';
import { IMAGE_MIME_TYPES, type PrivateObjectStorageClient } from '@khoaluantn/object-storage';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { h } from './handler.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  adminPayoutView, authorizeProofUpload, markPayoutPaid, playerPayoutView, submitPayoutInformation,
} from '../domain/rewardPayout.js';

const text = (max: number) => z.string().trim().min(1).max(max);
/** BR-CM-68: đúng bảy trường; không có ngày sinh, giấy tờ tùy thân hay tuổi. */
const informationBody = z.object({
  recipientName: text(120), email: z.string().trim().email().max(200), phone: z.string().trim().regex(/^\+?\d{9,15}$/),
  address: text(300), bankCode: text(40), bankAccountNumber: z.string().trim().regex(/^\d{6,30}$/), bankAccountName: text(120),
}).strict();
const uploadBody = z.object({
  mimeType: z.enum(IMAGE_MIME_TYPES), size: z.number().int().positive(), checksumSha256: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
}).strict();
const paidBody = z.object({
  transactionReference: text(80), proofObjectKey: text(300), confirm: z.literal(true),
}).strict();
const adminQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['awaiting_information', 'ready_to_pay', 'paid', 'cancelled']).optional(),
  programId: z.string().uuid().optional(),
});

export function createRewardPayoutRouter(resolveStorage: () => PrivateObjectStorageClient) {
  const router = Router();
  const user = (req: unknown) => (req as AuthenticatedRequest).user!;
  const storage = () => {
    try {
      return resolveStorage();
    } catch {
      throw new AppError('OBJECT_STORAGE_UNAVAILABLE', 'Kho lưu trữ chứng từ chưa sẵn sàng.', 503);
    }
  };
  const ownPayout = async (userId: string, id: string) => {
    const payout = await prisma.rewardPayout.findUnique({ where: { id } });
    if (!payout || payout.userId !== userId) throw new AppError('REWARD_PAYOUT_NOT_FOUND', 'Không tìm thấy khoản thưởng.', 404);
    return payout;
  };
  const proofUrl = async (objectKey: string | null) => (objectKey ? storage().getReadUrl(objectKey, { visibility: 'private' }) : null);

  router.get('/rewards/players/me/payouts', requireAuth, requireRole('player'), h(async (req, res) => {
    const now = new Date();
    const rows = await prisma.rewardPayout.findMany({ where: { userId: user(req).id }, orderBy: { createdAt: 'desc' } });
    res.json({ items: rows.map((row) => playerPayoutView(row, now)) });
  }));

  router.get('/rewards/players/me/payouts/:id', requireAuth, requireRole('player'), h(async (req, res) => {
    const payout = await ownPayout(user(req).id, z.string().uuid().parse(req.params.id));
    res.json({ payout: { ...playerPayoutView(payout, new Date()), proofUrl: await proofUrl(payout.proofObjectKey) } });
  }));

  router.put('/rewards/players/me/payouts/:id/information', requireAuth, requireRole('player'), h(async (req, res) => {
    const payout = await submitPayoutInformation(user(req).id, z.string().uuid().parse(req.params.id), informationBody.parse(req.body));
    res.json({ payout: playerPayoutView(payout, new Date()) });
  }));

  router.post('/rewards/admin/uploads', requireAuth, requireRole('admin'), h(async (req, res) => {
    res.status(201).json({ upload: await authorizeProofUpload(storage(), user(req).id, uploadBody.parse(req.body)) });
  }));

  router.get('/rewards/admin/payouts', requireAuth, requireRole('admin'), h(async (req, res) => {
    const query = adminQuery.parse(req.query);
    const where = { ...(query.status && { status: query.status }), ...(query.programId && { programId: query.programId }) };
    const [rows, total] = await Promise.all([
      prisma.rewardPayout.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.rewardPayout.count({ where }),
    ]);
    const now = new Date();
    res.json({ items: rows.map((row) => adminPayoutView(row, now)), total, page: query.page, pageSize: query.pageSize });
  }));

  router.get('/rewards/admin/payouts/:id', requireAuth, requireRole('admin'), h(async (req, res) => {
    const payout = await prisma.rewardPayout.findUnique({ where: { id: z.string().uuid().parse(req.params.id) } });
    if (!payout) throw new AppError('REWARD_PAYOUT_NOT_FOUND', 'Không tìm thấy khoản thưởng.', 404);
    res.json({ payout: { ...adminPayoutView(payout, new Date()), proofUrl: await proofUrl(payout.proofObjectKey) } });
  }));

  router.post('/rewards/admin/payouts/:id/mark-paid', requireAuth, requireRole('admin'), h(async (req, res) => {
    const { confirm: _confirmed, ...input } = paidBody.parse(req.body);
    const payout = await markPayoutPaid(storage(), user(req).id, z.string().uuid().parse(req.params.id), input);
    res.json({ payout: adminPayoutView(payout, new Date()) });
  }));

  return router;
}
