import { env } from './lib/env.js';
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
startRevenueReleaseScheduler();

bootstrapEventConsumption().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[finance-service] không kết nối được RabbitMQ (consume):', err);
});

bootstrapEventPublishing().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[finance-service] không kết nối được RabbitMQ (publish):', err);
});
