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

let stopPublishing: (() => Promise<void>) | undefined;
void bootstrapEventPublishing()
  .then((stop) => { stopPublishing = stop; })
  .catch((err) => console.error(`[${SERVICE_NAME}] RabbitMQ relay unavailable`, err));

async function shutdown(): Promise<void> {
  await stopPublishing?.();
  await prisma.$disconnect();
  server.close();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
