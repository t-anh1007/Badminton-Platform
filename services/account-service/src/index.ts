import { startWithIdleRelease } from '@khoaluantn/eventbus';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { createApp } from './app.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';
import { bootstrapEventConsumption } from './lib/eventConsumer.js';

const SERVICE_NAME = 'account-service';

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${env.port}`);
});

// Xem ghi chú ở finance-service/src/index.ts về cơ chế buông khi rảnh.
startWithIdleRelease({
  label: SERVICE_NAME,
  start: async () => [
    // D25: consumer nhận ProviderApproved để cộng vai `provider`.
    await bootstrapEventConsumption(),
    await bootstrapEventPublishing(),
  ],
  onRelease: async () => {
    await prisma.$disconnect();
    if (redis.status !== 'end') redis.disconnect();
  },
  onResume: async () => {
    // ioredis dùng lazyConnect: sau disconnect() phải gọi connect() lại tay.
    if (redis.status === 'end' || redis.status === 'close') await redis.connect();
  },
});