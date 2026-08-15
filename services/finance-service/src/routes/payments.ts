import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { createTopupIntent } from '../domain/topup.js';
import { payBookingWithBalance, createBookingSepayIntent } from '../domain/payment.js';
import { handleIncomingTransfer } from '../domain/sepayWebhook.js';
import { sepayWebhookPayloadSchema, mapSepayWebhookPayload } from '../domain/sepayPayload.js';
import { verifySepaySignature } from '../domain/sepaySignature.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import { handleOutgoingTransfer } from '../domain/outgoingTransfer.js';
import {
  createMatchContributionSepayIntent,
  getOrganizerContribution,
  getParticipantContribution,
  payMatchContributionWithBalance,
} from '../domain/matchFee.js';

export const paymentRouter = Router();

/** Header có thể là string | string[]; lấy giá trị đầu tiên để xác thực. */
function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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

paymentRouter.post(
  '/matches/:matchId/joins/:joinId/pay/balance',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const contribution = await getParticipantContribution(req.params.matchId!, req.params.joinId!);
    await payMatchContributionWithBalance(userId, contribution.id);
    res.status(200).json({ message: 'Đã thanh toán phí tham gia bằng số dư.' });
  }),
);

paymentRouter.post(
  '/matches/:matchId/joins/:joinId/pay/sepay',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const contribution = await getParticipantContribution(req.params.matchId!, req.params.joinId!);
    res.status(201).json(await createMatchContributionSepayIntent(userId, contribution.id));
  }),
);

paymentRouter.post(
  '/matches/:matchId/organizer-contribution/pay/balance',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const contribution = await getOrganizerContribution(req.params.matchId!);
    await payMatchContributionWithBalance(userId, contribution.id);
    res.status(200).json({ message: 'Đã thanh toán phần organizer.' });
  }),
);

paymentRouter.post(
  '/matches/:matchId/organizer-contribution/pay/sepay',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const contribution = await getOrganizerContribution(req.params.matchId!);
    res.status(201).json(await createMatchContributionSepayIntent(userId, contribution.id));
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

// Webhook SePay production — FIN-02/04/06 dùng CHUNG một điểm vào, rẽ nhánh theo
// PaymentIntent.refType khớp được (xem sepayWebhook.ts). Xác thực HMAC-SHA256:
// SePay ký `{timestamp}.{raw_body}` bằng Secret Key, gửi qua header
// `X-SePay-Signature: sha256=<hex>` + `X-SePay-Timestamp`. Sai/thiếu -> từ chối
// (chống lỗi P1 "ai biết matchCode cũng tự tạo tiền"). Idempotency theo `id`.
paymentRouter.post(
  '/webhooks/sepay',
  h(async (req, res) => {
    const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
    const valid = verifySepaySignature({
      rawBody,
      timestamp: firstHeader(req.headers['x-sepay-timestamp']),
      signature: firstHeader(req.headers['x-sepay-signature']),
      secret: env.sepayWebhookSecret,
    });
    if (!valid) {
      throw new AppError('INVALID_WEBHOOK_SIGNATURE', 'Chữ ký webhook không hợp lệ.', 401);
    }
    const payload = sepayWebhookPayloadSchema.parse(req.body);
    const mapped = mapSepayWebhookPayload(payload);
    if (mapped.direction === 'in') {
      await handleIncomingTransfer(mapped.transfer);
    } else {
      await handleOutgoingTransfer(mapped.transfer);
    }
    res.status(200).json({ success: true });
  }),
);
