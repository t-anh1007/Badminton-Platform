import { createApp as createAccountApp } from '../services/account-service/src/app.js';
import { createApp as createVenueApp } from '../services/venue-booking-service/src/app.js';
import { createApp as createFinanceApp } from '../services/finance-service/src/app.js';
import { createApp as createMatchmakingApp } from '../services/matchmaking-service/src/app.js';
import { createApp as createCommunityApp } from '../services/community-service/src/app.js';
import { bootstrapEventConsumption as venueConsume } from '../services/venue-booking-service/src/lib/eventConsumer.js';
import { bootstrapEventPublishing as venuePublish } from '../services/venue-booking-service/src/lib/rabbitmq.js';
import { bootstrapEventConsumption as financeConsume } from '../services/finance-service/src/lib/eventConsumer.js';
import { bootstrapEventPublishing as financePublish } from '../services/finance-service/src/lib/rabbitmq.js';

async function start() {
  await Promise.all([venueConsume(), venuePublish(), financeConsume(), financePublish()]);
  createAccountApp().listen(Number(process.env.ACCOUNT_PORT ?? 3001));
  createVenueApp().listen(Number(process.env.VENUE_BOOKING_PORT ?? 3002));
  createFinanceApp().listen(Number(process.env.FINANCE_PORT ?? 3003));
  createMatchmakingApp().listen(Number(process.env.MATCHMAKING_PORT ?? 3004));
  createCommunityApp().listen(Number(process.env.COMMUNITY_PORT ?? 3005));
}

void start();
