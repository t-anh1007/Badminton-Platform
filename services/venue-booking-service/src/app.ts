import express from 'express';
import { providerRouter } from './routes/providers.js';
import { venueRouter } from './routes/venues.js';
import { scheduleRouter } from './routes/schedule.js';
import { calendarRouter } from './routes/calendar.js';
import { discoveryRouter } from './routes/discovery.js';
import { bookingRouter } from './routes/bookings.js';
import { env } from './lib/env.js';

const SERVICE_NAME = 'venue-booking-service';

export function createApp() {
  const app = express();
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && env.webOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
    }
    next();
  });
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
  });

  app.use('/providers', providerRouter);
  app.use('/venues', venueRouter);
  app.use('/', scheduleRouter);
  app.use('/', calendarRouter);
  app.use('/', discoveryRouter);
  app.use('/', bookingRouter);

  return app;
}
