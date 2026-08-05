import express from 'express';
import { authRouter } from './routes/auth.js';
import { profileRouter } from './routes/profile.js';
import { adminRouter } from './routes/admin.js';

const SERVICE_NAME = 'account-service';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
  });

  app.use('/auth', authRouter);
  app.use('/profile', profileRouter);
  app.use('/admin', adminRouter);

  return app;
}
