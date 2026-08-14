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
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
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

export interface VenueSearchRow {
  venueId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  amenities: unknown;
  distanceKm: number;
  lowestPrice: string | null;
}

export interface VenueDetail {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  amenities: unknown;
  images: unknown;
  courts: Array<{ id: string; name: string }>;
}

export interface AvailabilitySlot {
  startMinute: number;
  endMinute: number;
  available: boolean;
  price: string | null;
}

export interface SlotSelection {
  courtId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  totalPrice: string;
}

export interface HoldResult {
  id: string;
  courtId: string;
  startAt: string;
  endAt: string;
  expiresAt: string;
}
export interface ProviderRow { id: string; orgName: string; status: string; }
export interface ProviderSelf { id: string; orgName: string; contact: unknown; status: 'pending' | 'approved' | 'rejected' | 'suspended'; decisionReason: string | null; decidedAt: string | null }
export interface ManagedCourt { id: string; name: string; active: boolean; configuration: { operatingHours: number; pricingRules: number; bookingRule: boolean }; operatingHours: Array<{ id: string; weekday: number; openMinute: number; closeMinute: number }>; closures: Array<{ id: string; date: string; reason: string | null }>; pricingRules: Array<{ id: string; weekday: number; startMinute: number; endMinute: number; price: string; version: number; effectiveFrom: string }>; bookingRule: { stepMinutes: number; minDurationMinutes: number; maxDurationMinutes: number } | null }
export interface ManagedVenue { id: string; name: string; address: string; lat: number; lng: number; amenities: unknown; images: unknown; courts: ManagedCourt[] }

export function searchVenues(params: { lat: number; lng: number; radiusKm?: number }) {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  return api<VenueSearchRow[]>(`/search?${query}`);
}

export const getVenueDetail = (venueId: string) => api<VenueDetail>(`/venues/${venueId}`);
export const getCourtAvailability = (courtId: string, date: string) =>
  api<{ closed: boolean; slots: AvailabilitySlot[] }>(`/courts/${courtId}/availability?date=${encodeURIComponent(date)}`);
export const selectSlot = (courtId: string, body: { startAt: string; durationMinutes: number }) =>
  api<SlotSelection>(`/courts/${courtId}/select-slot`, { method: 'POST', body: JSON.stringify(body) });
export const createHold = (body: { courtId: string; startAt: string; endAt: string }) =>
  api<HoldResult>('/holds', { method: 'POST', body: JSON.stringify(body) });
export const createBooking = (holdId: string) => api<BookingSummary>('/bookings', { method: 'POST', body: JSON.stringify({ holdId }) });
export const getAdminProviders = () => api<ProviderRow[]>('/providers?status=pending');
export const getMyProvider = () => api<ProviderSelf | null>('/providers/me');
export const registerProvider = (body: { orgName: string; contact: Record<string, string> }) => api<ProviderSelf>('/providers', { method: 'POST', body: JSON.stringify(body) });
export const getMyManagedVenues = () => api<ManagedVenue[]>('/providers/me/venues');
export const getMyManagedVenue = (id: string) => api<ManagedVenue>(`/providers/me/venues/${id}`);
export const approveProvider = (id: string) => api<{ message: string }>(`/providers/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
export const rejectProvider = (id: string, reason: string) => api<{ message: string }>(`/providers/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });

export async function getMyUpcomingBookings(): Promise<BookingSummary[]> {
  const result = await api<{ upcoming: BookingSummary[] }>('/players/me/bookings');
  return result.upcoming;
}

export async function getMyBookingHistory(): Promise<BookingSummary[]> {
  const result = await api<{ past: BookingSummary[] }>('/players/me/bookings');
  return result.past;
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
