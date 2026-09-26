import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { prisma } from '../lib/prisma.js';
import { HttpAccountDisplayNameClient } from '../clients/account.js';
import { activateMatchHold, createBookingFromHold, findPlayerScheduleConflicts, getMatchContext, getMatchContexts, getPaymentStatus, listAdminBookings, listMyBookings, listMyMatchSources, getMyBookingDetail, resolveMatchBooking } from '../domain/booking.js';
import { requireAuth, requireInternalService, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { cancelBookingByAdmin, cancelBookingByPlayer, cancelBookingByProvider, changeBookingCourt, listReplacementCourts } from '../domain/cancellation.js';

export const bookingRouter = Router();
// Read-only metadata for authorized service callers; existing UUID routes stay unchanged.
bookingRouter.post('/internal/bookings/references', requireInternalService, h(async (req, res) => {
  const { bookingIds = [], businessCodes = [] } = z.object({
    bookingIds: z.array(z.string().uuid()).max(500).optional(),
    businessCodes: z.array(z.string().regex(/^BK-\d{8}$/)).max(50).optional(),
  }).strict().refine((body) => (body.bookingIds?.length ?? 0) + (body.businessCodes?.length ?? 0) > 0).parse(req.body);
  const rows = await prisma.booking.findMany({
    where: { OR: [{ id: { in: bookingIds } }, { businessCode: { in: businessCodes } }] },
    select: { id: true, businessCode: true, startAt: true, userId: true, guestName: true, cancellationReason: true, court: { select: { name: true, venue: { select: { name: true } } } } },
  });
  // Presentation-only metadata for finance screens; never used to authorize money movement.
  // Tên khách là phần phụ: account nhận tối đa 200 id/lần và có thể đang ngủ (Railway) —
  // chia lô và chỉ chờ 1,5 giây để mã booking/tên sân vẫn về kịp giới hạn 3 giây của finance.
  const names = new Map<string, string>();
  const userIds = [...new Set(rows.flatMap((row) => row.userId ? [row.userId] : []))];
  const client = new HttpAccountDisplayNameClient();
  await Promise.race([
    (async () => {
      for (let offset = 0; offset < userIds.length; offset += 200) {
        for (const profile of await client.getPublicDisplayNames(userIds.slice(offset, offset + 200))) if (profile.displayName) names.set(profile.userId, profile.displayName);
      }
    })().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  const references = rows.map(({ court, ...row }) => ({ ...row, venueName: court.venue.name, courtName: court.name, customerName: row.userId ? names.get(row.userId) ?? null : row.guestName }));
  res.json({ references });
}));
bookingRouter.get('/admin/bookings', requireAuth, requireRole('admin'), h(async (req, res) => {
  const input = z.object({ query: z.string().max(120).optional(), status: z.enum(['held', 'confirmed', 'completed', 'cancelled']).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
  const result = await listAdminBookings(input);
  res.json({ ...result, items: result.items.map(serializeBooking) });
}));

/** `res.json()` KHÔNG serialize được `bigint` native (ném TypeError 500 —
 * lỗi P1 Codex bắt: test domain không chạm HTTP nên không lộ). `priceSnapshot`
 * là BigInt; chuyển sang chuỗi thập phân trước khi trả. Áp đệ quy cho mọi
 * object booking (một booking hoặc danh sách). */
function serializeBooking<T extends { priceSnapshot: bigint }>(b: T): Omit<T, 'priceSnapshot'> & { priceSnapshot: string } {
  return { ...b, priceSnapshot: b.priceSnapshot.toString() };
}

const createSchema = z.object({ holdId: z.string() });

// BOK-07 bước 1 — Chỉ chủ hold (requireAuth + kiểm userId trong domain).
bookingRouter.post(
  '/bookings',
  requireAuth,
  h(async (req, res) => {
    const { holdId } = createSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const booking = await createBookingFromHold(userId, holdId);
    res.status(201).json(serializeBooking(booking));
  }),
);

bookingRouter.post(
  '/admin/bookings/:id/cancel',
  requireAuth,
  requireRole('admin'),
  h(async (req, res) => {
    const { reason } = providerCancelSchema.parse(req.body);
    res.status(200).json(await cancelBookingByAdmin(req.params.id!, reason));
  }),
);

// Nội bộ — finance-service gọi để hỏi "booking còn hold không" (flows.md §5,
// FIN-03/04/06). Không qua gateway công khai, không cần requireAuth người chơi.
bookingRouter.get(
  '/internal/bookings/:id/payment-status',
  h(async (req, res) => {
    const status = await getPaymentStatus(req.params.id!);
    res.status(200).json(status);
  }),
);

bookingRouter.get(
  '/internal/bookings/:id/match-context',
  h(async (req, res) => {
    res.status(200).json(await getMatchContext(req.params.id!));
  }),
);

bookingRouter.post(
  '/internal/bookings/match-contexts',
  h(async (req, res) => {
    const { bookingIds } = z.object({ bookingIds: z.array(z.string().uuid()).min(1).max(500) }).parse(req.body);
    res.status(200).json({ contexts: await getMatchContexts(bookingIds) });
  }),
);

bookingRouter.get(
  '/internal/players/schedule-conflicts',
  requireInternalService,
  h(async (req, res) => {
    const input = z.object({
      userId: z.string().uuid(),
      startAt: z.coerce.date(),
      endAt: z.coerce.date(),
      excludeBookingId: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
    }).refine((value) => value.startAt < value.endAt, { message: 'startAt must be before endAt' }).parse(req.query);
    const excluded = input.excludeBookingId
      ? Array.isArray(input.excludeBookingId) ? input.excludeBookingId : [input.excludeBookingId]
      : [];
    res.status(200).json({
      conflicts: await findPlayerScheduleConflicts(input.userId, input.startAt, input.endAt, excluded),
    });
  }),
);

// D39: internal, idempotent command seam for the match settlement race. The
// venue database owns both the command receipt and the booking fence; callers
// never write or query venue tables directly.
const matchResolutionSchema = z.object({
  commandId: z.string().uuid(),
  matchId: z.string().uuid(),
  attemptId: z.string().uuid().nullable(),
  action: z.enum(['settle', 'withdraw', 'cancel']),
  venueRevision: z.number().int().nonnegative(),
}).strict();

// PLAN_MATCH-DEPOSIT — nội bộ: matchmaking gọi sau khi chủ kèo trả cọc để gia
// hạn hold + booking held tới hạn tìm đối X.
bookingRouter.post(
  '/internal/bookings/:id/activate-match-hold',
  requireInternalService,
  h(async (req, res) => {
    const { userId, deadlineAt } = z.object({
      userId: z.string().uuid(),
      deadlineAt: z.coerce.date(),
    }).strict().parse(req.body);
    const booking = await activateMatchHold(userId, z.string().uuid().parse(req.params.id), deadlineAt);
    res.status(200).json(serializeBooking(booking));
  }),
);

bookingRouter.post(
  '/internal/bookings/:id/match-resolution',
  requireInternalService,
  h(async (req, res) => {
    const input = matchResolutionSchema.parse(req.body);
    res.status(200).json(await resolveMatchBooking({ ...input, bookingId: z.string().uuid().parse(req.params.id) }));
  }),
);

// BOK-08
bookingRouter.get(
  '/players/me/bookings',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const result = await listMyBookings(userId);
    res.status(200).json({
      upcoming: result.upcoming.map(serializeBooking),
      past: result.past.map(serializeBooking),
    });
  }),
);

bookingRouter.get('/players/me/match-sources', requireAuth, h(async (req, res) => {
  res.status(200).json(await listMyMatchSources((req as AuthenticatedRequest).user!.id));
}));

bookingRouter.get(
  '/players/me/bookings/:id',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const result = await getMyBookingDetail(userId, req.params.id!);
    res.status(200).json({ booking: serializeBooking(result.booking), expectedRefundPercent: result.expectedRefundPercent, courtChangeNote: result.courtChangeNote });
  }),
);

bookingRouter.post(
  '/players/me/bookings/:id/cancel',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(200).json(await cancelBookingByPlayer(userId, req.params.id!));
  }),
);

bookingRouter.get(
  '/providers/bookings/:id/replacement-courts',
  requireAuth,
  requireRole('provider'),
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(200).json({ courts: await listReplacementCourts(userId, req.params.id!) });
  }),
);

const changeCourtSchema = z.object({ courtId: z.string().uuid() });
bookingRouter.post(
  '/providers/bookings/:id/change-court',
  requireAuth,
  requireRole('provider'),
  h(async (req, res) => {
    const { courtId } = changeCourtSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(200).json(serializeBooking(await changeBookingCourt(userId, req.params.id!, courtId)));
  }),
);

const providerCancelSchema = z.object({ reason: z.string().trim().min(1) });
bookingRouter.post(
  '/providers/bookings/:id/cancel',
  requireAuth,
  requireRole('provider'),
  h(async (req, res) => {
    const { reason } = providerCancelSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    res.status(200).json(await cancelBookingByProvider(userId, req.params.id!, reason));
  }),
);
