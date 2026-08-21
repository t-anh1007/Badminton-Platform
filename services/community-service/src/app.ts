import { markActivity } from '@khoaluantn/eventbus';
import express from 'express';
import { GeminiSupportAssistant, type SupportAssistantClient } from '@khoaluantn/ai';
import type { PolicyRetriever } from '@khoaluantn/ai';
import { HttpAccountEligibilityClient, type AccountEligibilityClient } from './clients/account.js';
import { HttpBookingClient, type BookingClient } from './clients/venueBooking.js';
import { createAssistantRouter } from './routes/assistant.js';
import { createCommunityRouter } from './routes/community.js';
import { createCommunityUploadRouter } from './routes/uploads.js';
import { createObjectStorageClientFromEnv, type ObjectStorageClient } from '@khoaluantn/object-storage';

const SERVICE_NAME = 'community-service';

export function createApp(dependencies?: {
  accountEligibilityClient?: AccountEligibilityClient;
  bookingClient?: BookingClient;
  supportAssistant?: SupportAssistantClient;
  policyRetriever?: PolicyRetriever;
  objectStorage?: ObjectStorageClient;
}) {
  const app = express();
  // Mọi request đều reset đồng hồ rảnh; nếu việc nền đang bị buông thì dựng lại.
  app.use((_req, _res, next) => { markActivity(); next(); });
  app.use(express.json());
  app.get('/health', (_req, res) => {
    res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
  });
  const resolveObjectStorage = () => dependencies?.objectStorage ?? createObjectStorageClientFromEnv();
  app.use(createCommunityRouter(dependencies?.accountEligibilityClient ?? new HttpAccountEligibilityClient(), resolveObjectStorage));
  app.use(createCommunityUploadRouter(resolveObjectStorage));
  app.use(createAssistantRouter(
    dependencies?.bookingClient ?? new HttpBookingClient(),
    dependencies?.supportAssistant ?? configuredSupportAssistant(),
    dependencies?.policyRetriever,
  ));
  return app;
}

function configuredSupportAssistant(): SupportAssistantClient | undefined {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return undefined;
  return new GeminiSupportAssistant({ apiKey, model });
}
