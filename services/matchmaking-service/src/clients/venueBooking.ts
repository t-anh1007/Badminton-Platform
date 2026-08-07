import { z } from 'zod';
import { venueMatchContextSchema, type VenueMatchContext } from '@khoaluantn/shared';

export type { VenueMatchContext };

export interface VenueBookingClient {
  getMatchContext(bookingId: string): Promise<VenueMatchContext | null>;
  createBookingFromHold(holdId: string, authorization: string): Promise<string>;
}

export class HttpVenueBookingClient implements VenueBookingClient {
  constructor(private readonly baseUrl = process.env.VENUE_BOOKING_URL ?? 'http://localhost:3002') {}

  async getMatchContext(bookingId: string): Promise<VenueMatchContext | null> {
    const response = await fetch(
      `${this.baseUrl}/internal/bookings/${encodeURIComponent(bookingId)}/match-context`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`venue-booking match context failed with ${response.status}`);
    return venueMatchContextSchema.parse(await response.json());
  }

  async createBookingFromHold(holdId: string, authorization: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/bookings`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ holdId }),
    });
    if (!response.ok) throw new Error(`venue-booking hold conversion failed with ${response.status}`);
    return z.object({ id: z.string() }).parse(await response.json()).id;
  }
}
