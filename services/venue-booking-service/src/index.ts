import { env } from './lib/env.js';
import { createApp } from './app.js';
import { bootstrapEventConsumption } from './lib/eventConsumer.js';

const SERVICE_NAME = 'venue-booking-service';

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${env.port}`);
});

bootstrapEventConsumption().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[venue-booking-service] không kết nối được RabbitMQ:', err);
});
