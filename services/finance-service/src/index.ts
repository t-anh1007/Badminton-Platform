import { startWithIdleRelease } from '@khoaluantn/eventbus';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { createApp } from './app.js';
import { bootstrapEventConsumption } from './lib/eventConsumer.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';
import { startRevenueReleaseScheduler } from './lib/revenueScheduler.js';

const SERVICE_NAME = 'finance-service';

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${env.port}`);
});

// Việc nền được buông sau một khoảng không có request để Railway ru ngủ được
// service (relay/AMQP/pool DB mở liên tục thì nó không bao giờ ngủ). Request
// kế tiếp dựng lại; event phát ra lúc ngủ nằm yên trong queue durable.
startWithIdleRelease({
  label: SERVICE_NAME,
  start: async () => [
    startRevenueReleaseScheduler(),
    await bootstrapEventConsumption(),
    await bootstrapEventPublishing(),
  ],
  onRelease: () => prisma.$disconnect(),
});