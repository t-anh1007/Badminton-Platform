import { env } from '../lib/env.js';
import { z } from 'zod';

const referencesSchema = z.object({
  references: z.array(z.object({ id: z.string().uuid(), businessCode: z.string().regex(/^BK-\d{8}$/), startAt: z.coerce.date().optional(), venueName: z.string().optional(), courtId: z.string().uuid().optional(), courtName: z.string().optional(), customerName: z.string().nullish(), userId: z.string().nullish(), guestName: z.string().nullish(), cancellationReason: z.string().nullish() })),
});

/** Presentation-only lookup. Never use display references to authorize or move money. */
export async function bookingReferences(bookingIds: string[]): Promise<Map<string, string>> {
  return new Map([...(await bookingDetails(bookingIds))].map(([id, row]) => [id, row.businessCode]));
}

/** Mã + giờ bắt đầu booking để hiển thị; thiếu dữ liệu thì trả map rỗng, không chặn số dư. */
export type BookingDetail = { businessCode: string; startAt?: Date; venueName?: string; courtId?: string; courtName?: string; customerName?: string | null; userId?: string | null; guestName?: string | null; cancellationReason?: string | null };
export async function bookingDetails(bookingIds: string[]): Promise<Map<string, BookingDetail>> {
  const ids = [...new Set(bookingIds)];
  const codes = new Map<string, BookingDetail>();
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
      for (const { id, ...row } of result.references) codes.set(id, row);
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

/** Tìm booking theo mã hiển thị (BK-xxxxxxxx) để lọc màn tài chính; lỗi tra cứu = không có kết quả. */
export async function bookingIdsByCodes(codes: string[]): Promise<string[]> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!codes.length || !token) return [];
  try {
    const response = await fetch(`${process.env.VENUE_BOOKING_SERVICE_URL ?? env.venueBookingServiceUrl}/internal/bookings/references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-service-token': token },
      body: JSON.stringify({ businessCodes: codes }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    return referencesSchema.parse(await response.json()).references.map((row) => row.id);
  } catch {
    return [];
  }
}
