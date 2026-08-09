import { Router } from 'express';
import { z } from 'zod';
import type { AccountEligibilityClient } from '../clients/account.js';
import {
  addTicketMessage,
  createComment,
  createPost,
  createReport,
  createTicket,
  editPost,
  getPublishedPost,
  getTicket,
  listOpenReports,
  listPublishedPosts,
  listTickets,
  moderateReport,
  removeComment,
  removePost,
  restoreContent,
  setTicketStatus,
} from '../domain/community.js';
import { requireAdmin, requireAuth, requirePlayer, type AuthenticatedRequest } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';

const uuid = z.string().uuid();
const postBody = z.object({ body: z.string().trim().min(1).max(5_000) }).strict();
const shortBody = z.object({ body: z.string().trim().min(1).max(1_000) }).strict();
const reportBody = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: uuid,
  reason: z.string().trim().min(1).max(1_000),
}).strict();
const moderationBody = z.object({
  action: z.enum(['hide', 'remove', 'dismiss']),
  reason: z.string().trim().min(1).max(1_000),
}).strict();
const restorationBody = z.object({ reason: z.string().trim().min(1).max(1_000) }).strict();
const ticketBody = z.object({
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1_000),
}).strict();
const ticketStatus = z.object({ status: z.enum(['resolved', 'closed']) }).strict();
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export function createCommunityRouter(accountEligibilityClient: AccountEligibilityClient) {
  const router = Router();

  router.get('/posts', withErrorHandling(async (req, res) => {
    const { page, pageSize } = pagination.parse(req.query);
    res.status(200).json({ posts: await listPublishedPosts(page, pageSize) });
  }));
  router.get('/posts/:postId', withErrorHandling(async (req, res) => {
    res.status(200).json(await getPublishedPost(uuid.parse(req.params.postId)));
  }));
  router.post('/posts', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const { body } = postBody.parse(req.body);
    res.status(201).json(await createPost(accountEligibilityClient, (req as AuthenticatedRequest).user!.id, body));
  }));
  router.patch('/posts/:postId', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const { body } = postBody.parse(req.body);
    res.status(200).json(await editPost(accountEligibilityClient, uuid.parse(req.params.postId), (req as AuthenticatedRequest).user!.id, body));
  }));
  router.delete('/posts/:postId', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    res.status(200).json(await removePost(accountEligibilityClient, uuid.parse(req.params.postId), (req as AuthenticatedRequest).user!.id));
  }));

  router.post('/posts/:postId/comments', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const { body } = shortBody.parse(req.body);
    res.status(201).json(await createComment(accountEligibilityClient, uuid.parse(req.params.postId), (req as AuthenticatedRequest).user!.id, body));
  }));
  router.delete('/comments/:commentId', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    res.status(200).json(await removeComment(accountEligibilityClient, uuid.parse(req.params.commentId), (req as AuthenticatedRequest).user!.id));
  }));

  router.post('/reports', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = reportBody.parse(req.body);
    res.status(201).json(await createReport(accountEligibilityClient, (req as AuthenticatedRequest).user!.id, input.targetType, input.targetId, input.reason));
  }));
  router.get('/admin/reports', requireAuth, requireAdmin, withErrorHandling(async (_req, res) => {
    res.status(200).json({ reports: await listOpenReports() });
  }));
  router.post('/admin/reports/:reportId/actions', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    const input = moderationBody.parse(req.body);
    res.status(200).json(await moderateReport(uuid.parse(req.params.reportId), (req as AuthenticatedRequest).user!.id, input.action, input.reason));
  }));
  router.post('/admin/content/:targetType/:targetId/restore', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    const targetType = z.enum(['post', 'comment']).parse(req.params.targetType);
    const targetId = uuid.parse(req.params.targetId);
    const { reason } = restorationBody.parse(req.body);
    res.status(200).json(await restoreContent(targetType, targetId, (req as AuthenticatedRequest).user!.id, reason));
  }));

  router.get('/tickets', requireAuth, withErrorHandling(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    res.status(200).json({ tickets: await listTickets(user.id, user.roles.includes('admin')) });
  }));
  router.post('/tickets', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const input = ticketBody.parse(req.body);
    res.status(201).json(await createTicket(accountEligibilityClient, (req as AuthenticatedRequest).user!.id, input.subject, input.body));
  }));
  router.get('/tickets/:ticketId', requireAuth, withErrorHandling(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    res.status(200).json(await getTicket(uuid.parse(req.params.ticketId), user.id, user.roles.includes('admin')));
  }));
  router.post('/tickets/:ticketId/messages', requireAuth, withErrorHandling(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const { body } = shortBody.parse(req.body);
    res.status(201).json(await addTicketMessage(accountEligibilityClient, uuid.parse(req.params.ticketId), user.id, user.roles.includes('admin'), body));
  }));
  router.post('/tickets/:ticketId/status', requireAuth, requireAdmin, withErrorHandling(async (req, res) => {
    const { status } = ticketStatus.parse(req.body);
    res.status(200).json(await setTicketStatus(uuid.parse(req.params.ticketId), status));
  }));

  return router;
}
