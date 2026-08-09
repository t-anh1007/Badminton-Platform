import express from 'express';
import { HttpAccountEligibilityClient, type AccountEligibilityClient } from './clients/account.js';
import { createCommunityRouter } from './routes/community.js';

const SERVICE_NAME = 'community-service';

export function createApp(dependencies?: { accountEligibilityClient?: AccountEligibilityClient }) {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => {
    res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
  });
  app.use(createCommunityRouter(dependencies?.accountEligibilityClient ?? new HttpAccountEligibilityClient()));
  return app;
}
