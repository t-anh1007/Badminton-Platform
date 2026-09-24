import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { confirmOperationalShutdown, getOperationalShutdownStatus, previewOperationalShutdown, reactivateOperationalShutdown } from '../domain/operationalShutdown.js';

const scopeSchema = z.object({ scopeType: z.enum(['venue', 'court']), id: z.string().uuid() });
const requestSchema = z.object({
  mode: z.enum(['winding_down', 'scheduled_close', 'emergency']),
  closeDate: z.string().optional(),
  reason: z.string().trim().max(1000).optional(),
}).strict();

export const operationalShutdownRouter = Router();

operationalShutdownRouter.get('/:scopeType/:id', requireAuth, h(async (req, res) => {
  const scope = scopeSchema.parse(req.params);
  const principal = (req as AuthenticatedRequest).user!;
  const actor = { userId: principal.id, roles: principal.roles };
  res.json(await getOperationalShutdownStatus(actor, { type: scope.scopeType, id: scope.id }));
}));

operationalShutdownRouter.post('/:scopeType/:id/reactivate', requireAuth, h(async (req, res) => {
  const scope = scopeSchema.parse(req.params);
  const principal = (req as AuthenticatedRequest).user!;
  const actor = { userId: principal.id, roles: principal.roles };
  res.json(await reactivateOperationalShutdown(actor, { type: scope.scopeType, id: scope.id }));
}));

operationalShutdownRouter.post('/:scopeType/:id/preview', requireAuth, h(async (req, res) => {
  const scope = scopeSchema.parse(req.params);
  const input = requestSchema.parse(req.body);
  const principal = (req as AuthenticatedRequest).user!;
  const actor = { userId: principal.id, roles: principal.roles };
  res.json(await previewOperationalShutdown(actor, { type: scope.scopeType, id: scope.id }, input));
}));

operationalShutdownRouter.post('/:scopeType/:id/confirm', requireAuth, h(async (req, res) => {
  const scope = scopeSchema.parse(req.params);
  const { previewToken, ...input } = requestSchema.extend({ previewToken: z.string().length(64) }).parse(req.body);
  const principal = (req as AuthenticatedRequest).user!;
  const actor = { userId: principal.id, roles: principal.roles };
  res.json(await confirmOperationalShutdown(actor, { type: scope.scopeType, id: scope.id }, input, previewToken));
}));
