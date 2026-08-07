import express from 'express';
import { prisma } from './lib/prisma.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';

const SERVICE_NAME = 'matchmaking-service';
const PORT = Number(process.env.MATCHMAKING_PORT ?? 3004);

const app = express();
app.use(express.json());

// Health/readiness — proof #4 của Gboot yêu cầu trả 200.
app.get('/health', (_req, res) => {
  res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
});

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
