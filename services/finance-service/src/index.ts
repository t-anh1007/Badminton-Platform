import { startWithIdleRelease } from '@khoaluantn/eventbus';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { createApp } from './app.js';
import { bootstrapEventConsumption } from './lib/eventConsumer.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';
import { startRevenueReleaseScheduler } from './lib/revenueScheduler.js';
import { FinanceRealtimeHub } from './realtime/financeRealtimeHub.js';
import { bootstrapFinanceRealtimeConsumer } from './realtime/financeRealtimeConsumer.js';

const SERVICE_NAME = 'finance-service';

const financeRealtimeHub = new FinanceRealtimeHub();
const app = createApp({ financeRealtimeHub });

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${env.port}`);
});

// Finance consumes durable monetary events such as BookingCancelled. Unlike an
// HTTP request, a RabbitMQ delivery cannot wake a released Railway service, so
// its consumer must remain active; otherwise wallet refunds remain queued until
// a later finance request arrives.
startWithIdleRelease({
  label: SERVICE_NAME,
  start: async () => [
    startRevenueReleaseScheduler(),
    await bootstrapEventConsumption(),
    await bootstrapEventPublishing(),
    await bootstrapFinanceRealtimeConsumer(financeRealtimeHub),
  ],
  onRelease: () => prisma.$disconnect(),
  idleMs: 0,
});
