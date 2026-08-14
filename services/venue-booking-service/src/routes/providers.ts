import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { getProviderSelf, listProviders, registerProvider, approveProvider, rejectProvider } from '../domain/provider.js';
import { getManagedVenueDetail, listManagedVenues } from '../domain/venue.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';

export const providerRouter = Router();

const registerSchema = z.object({ orgName: z.string(), contact: z.unknown().optional() });
const listSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional() });

providerRouter.get('/', requireAuth, requireRole('admin'), h(async (req, res) => {
  const { status } = listSchema.parse(req.query);
  res.status(200).json(await listProviders(status));
}));

providerRouter.get('/me', requireAuth, h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  res.status(200).json(await getProviderSelf(userId));
}));

providerRouter.get('/me/venues', requireAuth, h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  res.status(200).json(await listManagedVenues(userId));
}));

providerRouter.get('/me/venues/:id', requireAuth, h(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.id;
  res.status(200).json(await getManagedVenueDetail(userId, req.params.id!));
}));

providerRouter.post(
  '/',
  requireAuth,
  h(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const provider = await registerProvider(userId, input);
    res.status(201).json(provider);
  }),
);

const decisionSchema = z.object({ reason: z.string().optional() });

providerRouter.post(
  '/:id/approve',
  requireAuth,
  requireRole('admin'),
  h(async (req, res) => {
    await approveProvider(req.params.id!);
    res.status(200).json({ message: 'Đã duyệt hồ sơ.' });
  }),
);

providerRouter.post(
  '/:id/reject',
  requireAuth,
  requireRole('admin'),
  h(async (req, res) => {
    const { reason } = decisionSchema.parse(req.body);
    await rejectProvider(req.params.id!, reason ?? '');
    res.status(200).json({ message: 'Đã từ chối hồ sơ.' });
  }),
);
