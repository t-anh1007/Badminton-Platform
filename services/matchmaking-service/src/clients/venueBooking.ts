import { z } from 'zod';
import { venueMatchContextSchema, type MatchBookingResolutionPayload, type VenueMatchContext } from '@khoaluantn/shared';

export type { VenueMatchContext };

function internalServiceHeaders(): Record<string, string> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) throw new Error('Missing INTERNAL_SERVICE_TOKEN for mutating Venue command');
  return { 'content-type': 'application/json', 'x-internal-service-token': token };
}

export interface VenueBookingClient {
  getMatchContext(bookingId: string): Promise<VenueMatchContext | null>;
  getMatchContexts?(bookingIds: string[]): Promise<Array<VenueMatchContext | null>>;
  createBookingFromHold(holdId: string, authorization: string): Promise<string>;
  cancelConfirmedBooking(bookingId: string, authorization: string): Promise<{ refundPercent: number }>;
  resolveMatchBooking(input: {
    commandId: string;
    matchId: string;
    attemptId: string | null;
    action: 'withdraw' | 'cancel';
    venueRevision: number;
  }, bookingId: string): Promise<MatchBookingResolutionPayload>;
}

export class HttpVenueBookingClient implements VenueBookingClient {
  // Runtime normally configures VENUE_BOOKING_URL; the finance/venue internal
  // endpoint name is accepted as the same boundary for D39 schedulers/tests.
  constructor(private readonly baseUrl = process.env.VENUE_BOOKING_URL ?? process.env.VENUE_BOOKING_SERVICE_URL ?? 'http://localhost:3002') {}

  async getMatchContext(bookingId: string): Promise<VenueMatchContext | null> {
    const response = await fetch(
      `${this.baseUrl}/internal/bookings/${encodeURIComponent(bookingId)}/match-context`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`venue-booking match context failed with ${response.status}`);
    return venueMatchContextSchema.parse(await response.json());
  }

  async getMatchContexts(bookingIds: string[]): Promise<Array<VenueMatchContext | null>> {
    const response = await fetch(`${this.baseUrl}/internal/bookings/match-contexts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingIds }),
    });
    if (!response.ok) throw new Error(`venue-booking batch match context failed with ${response.status}`);
    return z.object({ contexts: z.array(venueMatchContextSchema.nullable()) }).parse(await response.json()).contexts;
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

  async cancelConfirmedBooking(bookingId: string, authorization: string) {
    const response = await fetch(
      `${this.baseUrl}/players/me/bookings/${encodeURIComponent(bookingId)}/cancel`,
      { method: 'POST', headers: { authorization } },
    );
    if (!response.ok) throw new Error(`venue-booking confirmed cancellation failed with ${response.status}`);
    return z.object({ refundPercent: z.number().int().min(0).max(100) }).passthrough()
      .parse(await response.json());
  }

  async resolveMatchBooking(input: {
    commandId: string;
    matchId: string;
    attemptId: string | null;
    action: 'withdraw' | 'cancel';
    venueRevision: number;
  }, bookingId: string): Promise<MatchBookingResolutionPayload> {
    const response = await fetch(
      `${this.baseUrl}/internal/bookings/${encodeURIComponent(bookingId)}/match-resolution`,
      {
        method: 'POST',
        headers: { ...internalServiceHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) throw new Error(`venue-booking match resolution failed with ${response.status}`);
    return z.object({
      commandId: z.string().uuid(), matchId: z.string().uuid(), bookingId: z.string().uuid(),
      attemptId: z.string().uuid().nullable(), action: z.enum(['settle', 'withdraw', 'cancel']),
      decision: z.enum(['confirmed', 'held_revoked', 'cancelled']),
      winningAttemptId: z.string().uuid().nullable(), venueRevision: z.number().int().nonnegative(),
    }).strict().parse(await response.json());
  }
}
