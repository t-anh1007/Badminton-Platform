import express from 'express';
import { HttpAccountClient, type AccountClient } from './clients/account.js';
import { HttpVenueBookingClient, type VenueBookingClient } from './clients/venueBooking.js';
import { passportRouter } from './routes/passports.js';
import { createMatchRouter } from './routes/matches.js';

const SERVICE_NAME = 'matchmaking-service';

export function createApp(dependencies?: {
  venueBookingClient?: VenueBookingClient;
  accountClient?: AccountClient;
}) {
  const venueBookingClient = dependencies?.venueBookingClient ?? new HttpVenueBookingClient();
  const accountClient = dependencies?.accountClient ?? new HttpAccountClient();
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => {
    res.status(200).json({ service: SERVICE_NAME, status: 'ok', ts: new Date().toISOString() });
  });
  app.use('/matches', createMatchRouter(venueBookingClient, accountClient));
  app.use('/passports', passportRouter);
  return app;
}
