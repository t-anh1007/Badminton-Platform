import { markActivity } from '@khoaluantn/eventbus';
import express from 'express';
import { createObjectStorageClientFromEnv, type ObjectStorageClient } from '@khoaluantn/object-storage';
import { authRouter } from './routes/auth.js';
import { createProfileRouter } from './routes/profile.js';
import { adminRouter } from './routes/admin.js';
import { createInternalRouter } from './routes/internal.js';

const SERVICE_NAME = 'account-service';

export function createApp(dependencies?: { objectStorage?: ObjectStorageClient }) {
  const resolveStorage = () => dependencies?.objectStorage ?? createObjectStorageClientFromEnv();
  const app = express();
  // Mọi request đều reset đồng hồ rảnh; nếu việc nền đang bị buông thì dựng lại.
  app.use((_req, _res, next) => { markActivity(); next(); });
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
  });

  app.use('/auth', authRouter);
  app.use('/profile', createProfileRouter(resolveStorage));
  app.use('/admin', adminRouter);
  app.use('/internal', createInternalRouter(resolveStorage));

  return app;
}
