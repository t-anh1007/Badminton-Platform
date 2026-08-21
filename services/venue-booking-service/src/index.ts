import { startWithIdleRelease } from '@khoaluantn/eventbus';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { createApp } from './app.js';
import { bootstrapEventConsumption } from './lib/eventConsumer.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';
import { startReapScheduler } from './lib/scheduler.js';

const SERVICE_NAME = 'venue-booking-service';

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${env.port}`);
});

// Xem ghi chú ở finance-service/src/index.ts về cơ chế buông khi rảnh.
startWithIdleRelease({
  label: SERVICE_NAME,
  start: async () => [
    // AC-BOK-06-3 + AC-BOK-07-5: dọn hold/booking held hết hạn ở runtime.
    startReapScheduler(),
    await bootstrapEventConsumption(),
    await bootstrapEventPublishing(),
  ],
  onRelease: () => prisma.$disconnect(),
});