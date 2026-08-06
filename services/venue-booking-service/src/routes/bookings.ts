import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { createBookingFromHold, getPaymentStatus, listMyBookings, getMyBookingDetail } from '../domain/booking.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

export const bookingRouter = Router();

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

// Nội bộ — finance-service gọi để hỏi "booking còn hold không" (flows.md §5,
// FIN-03/04/06). Không qua gateway công khai, không cần requireAuth người chơi.
bookingRouter.get(
  '/internal/bookings/:id/payment-status',
  h(async (req, res) => {
    const status = await getPaymentStatus(req.params.id!);
    res.status(200).json(status);
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

bookingRouter.get(
  '/players/me/bookings/:id',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const result = await getMyBookingDetail(userId, req.params.id!);
    res.status(200).json({ booking: serializeBooking(result.booking), expectedRefundPercent: result.expectedRefundPercent });
  }),
);
