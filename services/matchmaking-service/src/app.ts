import express from 'express';
import { GeminiMatchmakerClient, type MatchmakerExplanationClient } from '@khoaluantn/ai';
import { HttpAccountClient, type AccountClient } from './clients/account.js';
import { HttpVenueBookingClient, type VenueBookingClient } from './clients/venueBooking.js';
import { passportRouter } from './routes/passports.js';
import { createMatchRouter } from './routes/matches.js';

const SERVICE_NAME = 'matchmaking-service';

export function createApp(dependencies?: {
  venueBookingClient?: VenueBookingClient;
  accountClient?: AccountClient;
  matchmakerClient?: MatchmakerExplanationClient;
}) {
  const venueBookingClient = dependencies?.venueBookingClient ?? new HttpVenueBookingClient();
  const accountClient = dependencies?.accountClient ?? new HttpAccountClient();
  const matchmakerClient = dependencies?.matchmakerClient ?? configuredGeminiMatchmaker();
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => {
    res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
  });
  app.use('/matches', createMatchRouter(venueBookingClient, accountClient, matchmakerClient));
  app.use('/passports', passportRouter);
  return app;
}

function configuredGeminiMatchmaker(): MatchmakerExplanationClient | undefined {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return undefined;
  return new GeminiMatchmakerClient({ apiKey, model });
}
