import express from 'express';
import { walletRouter } from './routes/wallets.js';
import { paymentRouter } from './routes/payments.js';

const SERVICE_NAME = 'finance-service';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
  });

  app.use('/', walletRouter);
  app.use('/', paymentRouter);

  return app;
}
