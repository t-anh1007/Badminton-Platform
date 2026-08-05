import express from 'express';
import { providerRouter } from './routes/providers.js';
import { venueRouter } from './routes/venues.js';
import { scheduleRouter } from './routes/schedule.js';
import { calendarRouter } from './routes/calendar.js';
import { discoveryRouter } from './routes/discovery.js';

const SERVICE_NAME = 'venue-booking-service';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
  });

  app.use('/providers', providerRouter);
  app.use('/venues', venueRouter);
  app.use('/', scheduleRouter);
  app.use('/', calendarRouter);
  app.use('/', discoveryRouter);

  return app;
}
