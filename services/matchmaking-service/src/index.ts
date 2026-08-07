import { prisma } from './lib/prisma.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';
import { bootstrapRatingEventConsumption } from './lib/ratingEventConsumer.js';
import { createApp } from './app.js';

const SERVICE_NAME = 'matchmaking-service';
const PORT = Number(process.env.MATCHMAKING_PORT ?? 3004);

const app = createApp();

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
});

let stopPublishing: (() => Promise<void>) | undefined;
let stopConsuming: (() => Promise<void>) | undefined;
void bootstrapEventPublishing()
  .then((stop) => { stopPublishing = stop; })
  .catch((err) => console.error(`[${SERVICE_NAME}] RabbitMQ relay unavailable`, err));
void bootstrapRatingEventConsumption()
  .then((stop) => { stopConsuming = stop; })
  .catch((err) => console.error(`[${SERVICE_NAME}] RabbitMQ rating consumer unavailable`, err));

async function shutdown(): Promise<void> {
  await stopConsuming?.();
  await stopPublishing?.();
  await prisma.$disconnect();
  server.close();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
