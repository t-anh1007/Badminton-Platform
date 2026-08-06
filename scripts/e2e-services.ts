import { createApp as createAccountApp } from '../services/account-service/src/app.js';
import { createApp as createVenueApp } from '../services/venue-booking-service/src/app.js';
import { createApp as createFinanceApp } from '../services/finance-service/src/app.js';

createAccountApp().listen(Number(process.env.ACCOUNT_PORT ?? 3001));
createVenueApp().listen(Number(process.env.VENUE_BOOKING_PORT ?? 3002));
createFinanceApp().listen(Number(process.env.FINANCE_PORT ?? 3003));
