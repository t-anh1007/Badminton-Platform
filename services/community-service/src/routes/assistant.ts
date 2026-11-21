import { Router } from 'express';
import { z } from 'zod';
import type { SupportAssistantClient } from '@khoaluantn/ai';
import type { PolicyRetriever } from '@khoaluantn/ai';
import type { BookingClient } from '../clients/venueBooking.js';
import { answerSupportQuestion } from '../domain/supportAssistant.js';
import type { ChainLink } from '@khoaluantn/ai';
import type { PlayerDataClient } from '../clients/playerData.js';
import { answerPlayerQuestion } from '../domain/playerAssistant.js';
import { requireAuth, requirePlayer, type AuthenticatedRequest } from '../middleware/auth.js';
import { withErrorHandling } from './handler.js';

const chatBody = z.object({ question: z.string().trim().min(1).max(1_000) }).strict();
const playerChatBody = z.object({
  question: z.string().trim().min(1).max(1_000),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict().optional(),
}).strict();

export function createAssistantRouter(
  bookingClient: BookingClient,
  assistant?: SupportAssistantClient,
  policyRetriever?: PolicyRetriever,
  player?: { links: ChainLink[]; data: PlayerDataClient },
) {
  const router = Router();
  // Chatbot người chơi mở rộng (21/11/2026) — endpoint riêng, không đổi hành vi /assistant/chat cũ.
  if (player) {
    router.post('/assistant/player-chat', requireAuth, requirePlayer, withErrorHandling(async (req, res) => {
      const { question, location } = playerChatBody.parse(req.body);
      res.status(200).json(await answerPlayerQuestion({
        question,
        location,
        authorization: req.headers.authorization!,
        links: player.links,
        data: player.data,
      }));
    }));
  }
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
