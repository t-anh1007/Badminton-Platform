const BASE_URL = import.meta.env.VITE_VENUE_BOOKING_URL ?? '/api/venue';

function accessToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('accessToken');
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = accessToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể xử lý yêu cầu.');
  return body;
}

export interface BookingSummary {
  id: string;
  courtId: string;
  startAt: string;
  endAt: string;
  status: string;
  priceSnapshot: string;
  court?: { name: string; venue?: { name: string } };
}

export async function getMyUpcomingBookings(): Promise<BookingSummary[]> {
  const result = await api<{ upcoming: BookingSummary[] }>('/players/me/bookings');
  return result.upcoming;
}

export function getBookingDetail(id: string) {
  return api<{ booking: BookingSummary; expectedRefundPercent: number; courtChangeNote: string | null }>(`/players/me/bookings/${id}`);
}

export function cancelMyBooking(id: string) {
  return api<{ status: 'cancelled'; refundPercent: number }>(`/players/me/bookings/${id}/cancel`, { method: 'POST' });
}

export function getReplacementCourts(id: string) {
  return api<{ courts: Array<{ id: string; name: string }> }>(`/providers/bookings/${id}/replacement-courts`);
}

export function changeBookingCourt(id: string, courtId: string) {
  return api<BookingSummary>(`/providers/bookings/${id}/change-court`, { method: 'POST', body: JSON.stringify({ courtId }) });
}

export function cancelProviderBooking(id: string, reason: string) {
  return api<{ status: 'cancelled'; refundPercent: number }>(`/providers/bookings/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
