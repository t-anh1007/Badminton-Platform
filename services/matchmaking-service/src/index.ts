import { prisma } from './lib/prisma.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';
import { bootstrapRatingEventConsumption } from './lib/ratingEventConsumer.js';
import { createApp } from './app.js';
import { startJoinExpiryScheduler } from './domain/joins.js';
import { bootstrapMatchLifecycleEventConsumption } from './lib/matchLifecycleEventConsumer.js';
import { startMatchCutoffScheduler } from './domain/matchLifecycle.js';

const SERVICE_NAME = 'matchmaking-service';
const PORT = Number(process.env.MATCHMAKING_PORT ?? 3004);

const app = createApp();
const stopJoinExpiryScheduler = startJoinExpiryScheduler();
const stopMatchCutoffScheduler = startMatchCutoffScheduler();

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
});

let stopPublishing: (() => Promise<void>) | undefined;
let stopConsuming: (() => Promise<void>) | undefined;
let stopMatchLifecycleConsuming: (() => Promise<void>) | undefined;
void bootstrapEventPublishing()
  .then((stop) => { stopPublishing = stop; })
  .catch((err) => console.error(`[${SERVICE_NAME}] RabbitMQ relay unavailable`, err));
void bootstrapRatingEventConsumption()
  .then((stop) => { stopConsuming = stop; })
  .catch((err) => console.error(`[${SERVICE_NAME}] RabbitMQ rating consumer unavailable`, err));
void bootstrapMatchLifecycleEventConsumption()
  .then((stop) => { stopMatchLifecycleConsuming = stop; })
  .catch((err) => console.error(`[${SERVICE_NAME}] RabbitMQ match lifecycle consumer unavailable`, err));

async function shutdown(): Promise<void> {
  await stopJoinExpiryScheduler();
  await stopMatchCutoffScheduler();
  await stopConsuming?.();
  await stopMatchLifecycleConsuming?.();
  await stopPublishing?.();
  await prisma.$disconnect();
  server.close();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
