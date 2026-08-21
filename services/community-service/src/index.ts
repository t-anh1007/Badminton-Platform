import { startWithIdleRelease } from '@khoaluantn/eventbus';
import { prisma } from './lib/prisma.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';
import { createApp } from './app.js';

const SERVICE_NAME = 'community-service';
const PORT = Number(process.env.COMMUNITY_PORT ?? 3005);
const app = createApp();

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
});

// Xem ghi chú ở finance-service/src/index.ts về cơ chế buông khi rảnh.
const idle = startWithIdleRelease({
  label: SERVICE_NAME,
  start: async () => [await bootstrapEventPublishing()],
  onRelease: () => prisma.$disconnect(),
});

async function shutdown(): Promise<void> {
  await idle.stop();
  await prisma.$disconnect();
  server.close();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });