import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { listBusinessRevenue } from '../domain/revenueRelease.js';
import { cancelWithdrawal, createWithdrawal, rejectWithdrawal } from '../domain/withdrawal.js';
import {
  assignIncomingEvent, assignOutgoingEvent, finalizePartialWithdrawal,
  listUnmatchedEvents, markEventOutOfScope,
} from '../domain/reconciliation.js';
import { prisma } from '../lib/prisma.js';

export const financeOperationsRouter = Router();
const positiveAmount = z.string().regex(/^[1-9]\d*$/);
const withdrawalSchema = z.object({
  amount: positiveAmount,
  bankCode: z.string().trim().min(1),
  bankAccountNumber: z.string().trim().min(1),
  bankAccountName: z.string().trim().min(1),
});
const reasonSchema = z.object({ reason: z.string().trim().min(1) });

financeOperationsRouter.get('/providers/me/revenue', requireAuth, requireRole('provider'), h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  const query = z.object({ venueId: z.string().uuid().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(req.query);
  const rows = await listBusinessRevenue(userId, query);
  res.json(rows.map((row) => ({ ...row, gross: row.gross.toString(), net: row.net.toString(), commission: row.commission.toString() })));
}));

financeOperationsRouter.get('/providers/me/withdrawals', requireAuth, requireRole('provider'), h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  const rows = await prisma.withdrawalRequest.findMany({ where: { sellerUserId: userId }, orderBy: { createdAt: 'desc' } });
  res.json(rows.map((row) => ({ ...row, amount: row.amount.toString(), paidAmount: row.paidAmount?.toString() ?? '0' })));
}));

financeOperationsRouter.post('/providers/me/withdrawals', requireAuth, requireRole('provider'), h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  const body = withdrawalSchema.parse(req.body);
  const request = await createWithdrawal(userId, { ...body, amount: BigInt(body.amount) });
  res.status(201).json({ ...request, amount: request.amount.toString(), paidAmount: request.paidAmount?.toString() ?? '0' });
}));

financeOperationsRouter.post('/providers/me/withdrawals/:id/cancel', requireAuth, requireRole('provider'), h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  const request = await cancelWithdrawal(userId, req.params.id!);
  res.json({ id: request.id, status: request.status });
}));

financeOperationsRouter.get('/admin/withdrawals', requireAuth, requireRole('admin'), h(async (_req, res) => {
  const rows = await prisma.withdrawalRequest.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(rows.map((row) => ({ ...row, amount: row.amount.toString(), paidAmount: row.paidAmount?.toString() ?? '0' })));
}));

financeOperationsRouter.post('/admin/withdrawals/:id/reject', requireAuth, requireRole('admin'), h(async (req, res) => {
  const actor = (req as AuthenticatedRequest).user!.id;
  const { reason } = reasonSchema.parse(req.body);
  const row = await rejectWithdrawal(actor, req.params.id!, reason);
  res.json({ id: row.id, status: row.status });
}));

financeOperationsRouter.post('/admin/withdrawals/:id/finalize-partial', requireAuth, requireRole('admin'), h(async (req, res) => {
  const actor = (req as AuthenticatedRequest).user!.id;
  const { reason } = reasonSchema.parse(req.body);
  await finalizePartialWithdrawal(actor, req.params.id!, reason);
  res.json({ id: req.params.id, status: 'paid' });
}));

financeOperationsRouter.get('/admin/reconciliation', requireAuth, requireRole('admin'), h(async (_req, res) => {
  const rows = await listUnmatchedEvents();
  res.json(rows.map((row) => ({ ...row, amount: row.amount.toString() })));
}));

financeOperationsRouter.post('/admin/reconciliation/:id/incoming', requireAuth, requireRole('admin'), h(async (req, res) => {
  const actor = (req as AuthenticatedRequest).user!.id;
  const body = reasonSchema.extend({ userId: z.string().uuid() }).parse(req.body);
  await assignIncomingEvent(actor, req.params.id!, body.userId, body.reason);
  res.json({ id: req.params.id, status: 'matched_manual' });
}));

financeOperationsRouter.post('/admin/reconciliation/:id/outgoing', requireAuth, requireRole('admin'), h(async (req, res) => {
  const actor = (req as AuthenticatedRequest).user!.id;
  const body = reasonSchema.extend({ withdrawalRequestId: z.string().uuid() }).parse(req.body);
  await assignOutgoingEvent(actor, req.params.id!, body.withdrawalRequestId, body.reason);
  res.json({ id: req.params.id, status: 'matched_manual' });
}));

financeOperationsRouter.post('/admin/reconciliation/:id/out-of-scope', requireAuth, requireRole('admin'), h(async (req, res) => {
  const actor = (req as AuthenticatedRequest).user!.id;
  const { reason } = reasonSchema.parse(req.body);
  await markEventOutOfScope(actor, req.params.id!, reason);
  res.json({ id: req.params.id, status: 'out_of_scope' });
}));
