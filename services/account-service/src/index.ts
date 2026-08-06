import { env } from './lib/env.js';
import { createApp } from './app.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';
import { bootstrapEventConsumption } from './lib/eventConsumer.js';

const SERVICE_NAME = 'account-service';

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${env.port}`);
});

bootstrapEventPublishing().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[account-service] không kết nối được RabbitMQ (publish):', err);
});

// D25: consumer đầu tiên — nhận ProviderApproved để cộng vai `provider`.
bootstrapEventConsumption().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[account-service] không kết nối được RabbitMQ (consume):', err);
});
