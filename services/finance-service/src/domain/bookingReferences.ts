import { env } from '../lib/env.js';
import { z } from 'zod';

const referencesSchema = z.object({
  references: z.array(z.object({ id: z.string().uuid(), businessCode: z.string().regex(/^BK-\d{8}$/) })),
});

/** Presentation-only lookup. Never use display references to authorize or move money. */
export async function bookingReferences(bookingIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(bookingIds)];
  const codes = new Map<string, string>();
  if (!ids.length) return codes;
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) return codes;
  const baseUrl = process.env.VENUE_BOOKING_SERVICE_URL ?? env.venueBookingServiceUrl;
  try {
    for (let offset = 0; offset < ids.length; offset += 500) {
      const response = await fetch(`${baseUrl}/internal/bookings/references`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-service-token': token },
        body: JSON.stringify({ bookingIds: ids.slice(offset, offset + 500) }),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error(`Venue reference lookup returned ${response.status}`);
      const result = referencesSchema.parse(await response.json());
      for (const row of result.references) codes.set(row.id, row.businessCode);
    }
  } catch {
    // Missing presentation metadata must not hide balances or reconciliation work.
    console.warn('[booking-references] Venue references temporarily unavailable');
  }
  return codes;
}

export async function withBookingReferences<T extends { bookingId: string }>(rows: T[]) {
  const codes = await bookingReferences(rows.map((row) => row.bookingId));
  return rows.map((row) => ({ ...row, bookingCode: codes.get(row.bookingId) ?? null }));
}
