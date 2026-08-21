import { startWithIdleRelease } from '@khoaluantn/eventbus';
import { prisma } from './lib/prisma.js';
import { bootstrapEventPublishing } from './lib/rabbitmq.js';
import { bootstrapRatingEventConsumption } from './lib/ratingEventConsumer.js';
import { createApp } from './app.js';
import { HttpVenueBookingClient } from './clients/venueBooking.js';
import { startJoinExpiryScheduler } from './domain/joins.js';
import { bootstrapMatchLifecycleEventConsumption } from './lib/matchLifecycleEventConsumer.js';
import { attachQuickMatchGateway } from './lib/quickMatchGateway.js';
import { startMatchCutoffScheduler } from './domain/matchLifecycle.js';

const SERVICE_NAME = 'matchmaking-service';
const PORT = Number(process.env.MATCHMAKING_PORT ?? 3004);

const venueBookingClient = new HttpVenueBookingClient();
const app = createApp({ venueBookingClient });

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
});
// Gateway WebSocket bám vào http server, không buông theo chu kỳ rảnh: phiên
// Tìm nhanh đang mở phải sống tới khi người dùng đóng.
const stopQuickMatchGateway = attachQuickMatchGateway(server, venueBookingClient);

// Xem ghi chú ở finance-service/src/index.ts về cơ chế buông khi rảnh.
const idle = startWithIdleRelease({
  label: SERVICE_NAME,
  start: async () => [
    startJoinExpiryScheduler(),
    startMatchCutoffScheduler(),
    await bootstrapRatingEventConsumption(),
    await bootstrapMatchLifecycleEventConsumption(),
    await bootstrapEventPublishing(),
  ],
  onRelease: () => prisma.$disconnect(),
});

async function shutdown(): Promise<void> {
  await idle.stop();
  await stopQuickMatchGateway();
  await prisma.$disconnect();
  server.close();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });