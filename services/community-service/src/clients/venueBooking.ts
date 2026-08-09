import { z } from 'zod';

export interface OwnBookingSummary {
  id: string;
  startAt: string;
  venueName: string;
  courtName: string;
}

export interface BookingClient {
  getMyBookings(authorization: string): Promise<{ upcoming: OwnBookingSummary[]; past: OwnBookingSummary[] }>;
}

const bookingSummary = z.object({
  id: z.string().uuid(),
  startAt: z.string().datetime(),
  court: z.object({ name: z.string(), venue: z.object({ name: z.string() }) }),
}).passthrough();
const bookingList = z.object({ upcoming: z.array(bookingSummary), past: z.array(bookingSummary) });

/** Calls only Venue's owner-scoped endpoint with the caller's own access token. */
export class HttpBookingClient implements BookingClient {
  constructor(private readonly baseUrl = process.env.VENUE_BOOKING_SERVICE_URL ?? 'http://localhost:3002') {}

  async getMyBookings(authorization: string) {
    const response = await fetch(`${this.baseUrl}/players/me/bookings`, { headers: { authorization } });
    if (!response.ok) throw new Error(`own bookings lookup failed with ${response.status}`);
    const parsed = bookingList.parse(await response.json());
    const mapBooking = (booking: z.infer<typeof bookingSummary>): OwnBookingSummary => ({
      id: booking.id,
      startAt: booking.startAt,
      venueName: booking.court.venue.name,
      courtName: booking.court.name,
    });
    return { upcoming: parsed.upcoming.map(mapBooking), past: parsed.past.map(mapBooking) };
  }
}
