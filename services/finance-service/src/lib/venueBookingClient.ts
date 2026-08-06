import { env } from './env.js';
import { AppError } from './errors.js';

export interface PaymentStatus {
  bookingId: string;
  userId: string | null;
  status: string;
  gross: string;
  stillPayable: boolean;
}

/** flows.md §5 — "Hỏi venue-booking-service booking còn hold không?" — API
 * đồng bộ (D17 cho phép giao tiếp qua API hoặc event), không phải event, vì
 * FIN-03 cần quyết định NGAY trong luồng thanh toán bằng số dư. */
export async function fetchPaymentStatus(bookingId: string): Promise<PaymentStatus> {
  const res = await fetch(`${env.venueBookingServiceUrl}/internal/bookings/${bookingId}/payment-status`);
  if (res.status === 404) {
    throw new AppError('BOOKING_NOT_FOUND', 'Không tìm thấy booking.', 404);
  }
  if (!res.ok) {
    throw new AppError('VENUE_BOOKING_UNAVAILABLE', 'Không hỏi được trạng thái booking.', 502);
  }
  return (await res.json()) as PaymentStatus;
}
