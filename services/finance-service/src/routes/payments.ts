import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { createTopupIntent } from '../domain/topup.js';
import { payBookingWithBalance, createBookingSepayIntent } from '../domain/payment.js';
import { handleIncomingTransfer } from '../domain/sepayWebhook.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';

export const paymentRouter = Router();

const topupSchema = z.object({ amount: z.string() });

// FIN-02 bước 1-2
paymentRouter.post(
  '/wallet/topup-intents',
  requireAuth,
  h(async (req, res) => {
    const { amount } = topupSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    const intent = await createTopupIntent(userId, BigInt(amount));
    res.status(201).json(intent);
  }),
);

// FIN-03
paymentRouter.post(
  '/bookings/:bookingId/pay/balance',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    await payBookingWithBalance(userId, req.params.bookingId!);
    res.status(200).json({ message: 'Đã thanh toán bằng số dư.' });
  }),
);

// FIN-04 bước 1
paymentRouter.post(
  '/bookings/:bookingId/pay/sepay',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const intent = await createBookingSepayIntent(userId, req.params.bookingId!);
    res.status(201).json(intent);
  }),
);

const webhookSchema = z.object({
  externalRef: z.string(),
  // Chuỗi số nguyên DƯƠNG — chặn amount<=0 (D23): số âm/không có thể dùng để
  // tạo bút toán rác hoặc rút tiền qua ngả webhook.
  amount: z.string().regex(/^[1-9]\d*$/, 'amount phải là số nguyên dương'),
  rawRef: z.string(),
  direction: z.enum(['in', 'out']).default('in'),
});

// Mô phỏng webhook SePay (không có cổng thật ở GĐ1) — FIN-02/04/06 dùng CHUNG
// một điểm vào, rẽ nhánh theo PaymentIntent.refType khớp được (xem sepayWebhook.ts).
// D23: xác thực bằng shared secret qua header `x-sepay-signature`. Không có
// secret đúng thì từ chối — chống lỗi P1 "ai biết matchCode cũng tự tạo tiền".
paymentRouter.post(
  '/webhooks/sepay',
  h(async (req, res) => {
    const signature = req.headers['x-sepay-signature'];
    if (signature !== env.sepayWebhookSecret) {
      throw new AppError('INVALID_WEBHOOK_SIGNATURE', 'Chữ ký webhook không hợp lệ.', 401);
    }
    const body = webhookSchema.parse(req.body);
    if (body.direction === 'in') {
      await handleIncomingTransfer({ externalRef: body.externalRef, amount: BigInt(body.amount), rawRef: body.rawRef });
    }
    res.status(200).json({ received: true });
  }),
);
