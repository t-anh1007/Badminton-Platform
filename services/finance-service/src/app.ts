import { markActivity } from '@khoaluantn/eventbus';
import express from 'express';
import { walletRouter } from './routes/wallets.js';
import { paymentRouter } from './routes/payments.js';
import { financeOperationsRouter } from './routes/financeOperations.js';
import { env } from './lib/env.js';

const SERVICE_NAME = 'finance-service';

export function createApp() {
  const app = express();
  // Mọi request đều reset đồng hồ rảnh; nếu việc nền đang bị buông thì dựng lại.
  app.use((_req, _res, next) => { markActivity(); next(); });
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && env.webOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    }
    next();
  });
  // Giữ lại raw body để xác thực HMAC-SHA256 của SePay (ký trên đúng byte gốc,
  // KHÔNG phải JSON tái tạo — thứ tự khóa/khoảng trắng có thể khác).
  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
  });

  app.use('/', walletRouter);
  app.use('/', paymentRouter);
  app.use('/', financeOperationsRouter);

  return app;
}
