import { env } from './lib/env.js';
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

// AC-BOK-06-3 + AC-BOK-07-5: dọn hold/booking held hết hạn ở runtime.
startReapScheduler();

bootstrapEventConsumption().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[venue-booking-service] không kết nối được RabbitMQ (consume):', err);
});

// G4: cần publish BookingConfirmed/PaymentTooLate — trước chỉ có consume.
bootstrapEventPublishing().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[venue-booking-service] không kết nối được RabbitMQ (publish):', err);
});
