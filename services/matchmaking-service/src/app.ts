import express from 'express';
import { passportRouter } from './routes/passports.js';

const SERVICE_NAME = 'matchmaking-service';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => {
    res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
  });
  app.use('/passports', passportRouter);
  return app;
}
