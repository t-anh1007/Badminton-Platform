import { env } from './env.js';
import { AppError } from './errors.js';
import type { MatchBookingResolutionPayload } from '@khoaluantn/shared';

export interface PaymentStatus {
  bookingId: string;
  userId: string | null;
  status: string;
  gross: string;
  stillPayable: boolean;
}

function internalServiceHeaders(): Record<string, string> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) throw new AppError('INTERNAL_SERVICE_AUTH_UNCONFIGURED', 'Chưa cấu hình xác thực Venue nội bộ.', 503);
  return { 'content-type': 'application/json', 'x-internal-service-token': token };
}

/** flows.md §5 — "Hỏi venue-booking-service booking còn hold không?" — API
 * đồng bộ (D17 cho phép giao tiếp qua API hoặc event), không phải event, vì
 * FIN-03 cần quyết định NGAY trong luồng thanh toán bằng số dư. */
export async function fetchPaymentStatus(bookingId: string): Promise<PaymentStatus> {
  // Keep the validated configured value as the default, while resolving an
  // explicit process override at request time for controlled service tests.
  // Runtime deployments still set the same `VENUE_BOOKING_SERVICE_URL` once.
  const baseUrl = process.env.VENUE_BOOKING_SERVICE_URL ?? env.venueBookingServiceUrl;
  const res = await fetch(`${baseUrl}/internal/bookings/${bookingId}/payment-status`);
  if (res.status === 404) {
    throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);
  }
  if (!res.ok) {
    throw new AppError('VENUE_BOOKING_UNAVAILABLE', 'Không hỏi được trạng thái booking.', 502);
  }
  return (await res.json()) as PaymentStatus;
}

/** D39: finance sends the final settlement command only after it has accepted
 * every contribution into platform reserve. Venue is still the atomic winner. */
export async function resolveMatchBooking(input: {
  commandId: string;
  matchId: string;
  bookingId: string;
  attemptId: string;
  venueRevision: number;
}): Promise<MatchBookingResolutionPayload> {
  const baseUrl = process.env.VENUE_BOOKING_SERVICE_URL ?? env.venueBookingServiceUrl;
  const res = await fetch(`${baseUrl}/internal/bookings/${input.bookingId}/match-resolution`, {
    method: 'POST',
    headers: internalServiceHeaders(),
    body: JSON.stringify({
      commandId: input.commandId,
      matchId: input.matchId,
      attemptId: input.attemptId,
      action: 'settle',
      venueRevision: input.venueRevision,
    }),
  });
  if (!res.ok) throw new AppError('VENUE_BOOKING_UNAVAILABLE', 'KhÃ´ng chÃ³t Ä‘Æ°á»£c booking kÃ¨o.', 502);
  return (await res.json()) as MatchBookingResolutionPayload;
}
