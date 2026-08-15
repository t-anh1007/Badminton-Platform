import { Router } from 'express';
import { z } from 'zod';
import type { SupportAssistantClient } from '@khoaluantn/ai';
import type { PolicyRetriever } from '@khoaluantn/ai';
import type { BookingClient } from '../clients/venueBooking.js';
import { answerSupportQuestion } from '../domain/supportAssistant.js';
import { requireAuth, requirePlayer, type AuthenticatedRequest } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';

const chatBody = z.object({ question: z.string().trim().min(1).max(1_000) }).strict();

export function createAssistantRouter(
  bookingClient: BookingClient,
  assistant?: SupportAssistantClient,
  policyRetriever?: PolicyRetriever,
) {
  const router = Router();
  router.post('/assistant/chat', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
    const { question } = chatBody.parse(req.body);
    res.status(200).json(await answerSupportQuestion(
      question,
      req.headers.authorization!,
      bookingClient,
      assistant,
      policyRetriever,
    ));
  }));
  return router;
}
