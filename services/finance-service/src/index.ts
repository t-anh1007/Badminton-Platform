import { startWithIdleRelease } from '@khoaluantn/eventbus';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { createApp } from './app.js';
import { bootstrapEventConsumption } from './lib/eventConsumer.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';
import { startRevenueReleaseScheduler } from './lib/revenueScheduler.js';
import { cancelExpiredClaims } from './domain/rewardPayout.js';
import { FinanceRealtimeHub } from './realtime/financeRealtimeHub.js';
import { bootstrapFinanceRealtimeConsumer } from './realtime/financeRealtimeConsumer.js';

const SERVICE_NAME = 'finance-service';

const financeRealtimeHub = new FinanceRealtimeHub();
const app = createApp({ financeRealtimeHub });

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${env.port}`);
});

// Finance consumes durable monetary events such as BookingCancelled. A RabbitMQ
// delivery cannot wake a released/sleeping Railway service, so every publisher's
// outbox relay pings finance /health via EVENT_WAKE_URLS right after publishing;
// on wake the consumer drains the durable queue. Staying awake 24/7 instead kept
// finance + Postgres + RabbitMQ billed around the clock.
startWithIdleRelease({
  label: SERVICE_NAME,
  start: async () => [
    startRevenueReleaseScheduler(),
    // BR-CM-68: hủy khoản thưởng quá hạn bổ sung thông tin; ready_to_pay không bao giờ tự hủy.
    (() => {
      const timer = setInterval(() => {
        void cancelExpiredClaims().catch((error) => console.error('[finance-service] lỗi hủy thưởng quá hạn:', error));
      }, 60_000);
      timer.unref();
      return () => clearInterval(timer);
    })(),
    await bootstrapEventConsumption(),
    await bootstrapEventPublishing(),
    await bootstrapFinanceRealtimeConsumer(financeRealtimeHub),
  ],
  onRelease: () => prisma.$disconnect(),
});
