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
  holdExpiresAt?: string | null;
  terminalStatus?: 'confirmed' | 'cancelled' | null;
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
  courts: Array<{ id: string; name: string; bookingRule: CourtBookingRule | null }>;
}

export interface CourtBookingRule {
  stepMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
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
export interface MatchSourceCourt {
  id: string;
  name: string;
  venue: { id: string; name: string; address: string };
}
export interface MatchHoldSource {
  id: string;
  startAt: string;
  endAt: string;
  expiresAt: string;
  court: MatchSourceCourt;
}
export interface MatchBookingSource {
  id: string;
  startAt: string;
  endAt: string;
  holdExpiresAt: string | null;
  status: 'held';
  court: MatchSourceCourt;
}
export interface ProviderRow { id: string; orgName: string; status: string; userId?: string; contact?: { contact?: string; email?: string; phone?: string } | null; }
export interface ProviderSelf { id: string; orgName: string; contact: unknown; status: 'pending' | 'approved' | 'rejected' | 'suspended'; decisionReason: string | null; decidedAt: string | null }
export interface ManagedCourt { id: string; name: string; active: boolean; configuration: { operatingHours: number; pricingRules: number; bookingRule: boolean }; operatingHours: Array<{ id: string; weekday: number; openMinute: number; closeMinute: number }>; closures: Array<{ id: string; date: string; reason: string | null }>; pricingRules: Array<{ id: string; weekday: number; startMinute: number; endMinute: number; price: string; version: number; effectiveFrom: string }>; bookingRule: { stepMinutes: number; minDurationMinutes: number; maxDurationMinutes: number } | null }
export interface ManagedVenue { id: string; name: string; address: string; lat: number; lng: number; amenities: unknown; images: unknown; courts: ManagedCourt[] }
export interface VenueUploadAuthorization { objectKey: string; uploadUrl: string; headers: Record<string, string>; expiresAt: string }
export interface AdminBookingRow { id: string; status: string; startAt: string; endAt: string; priceSnapshot: string; player: { label: string }; court: { name: string; venue: { name: string } } }

export function searchVenues(params: { lat: number; lng: number; radiusKm?: number; minPrice?: number; maxPrice?: number; sortBy?: 'distance' | 'price'; date?: string; startMinute?: number; endMinute?: number }) {
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
export const getMyMatchSources = () => api<{ holds: MatchHoldSource[]; bookings: MatchBookingSource[] }>('/players/me/match-sources');
export const getAdminProviders = () => api<ProviderRow[]>('/providers?status=pending');
export const getMyProvider = () => api<ProviderSelf | null>('/providers/me');
export const registerProvider = (body: { orgName: string; contact: Record<string, string> }) => api<ProviderSelf>('/providers', { method: 'POST', body: JSON.stringify(body) });
export const getMyManagedVenues = () => api<ManagedVenue[]>('/providers/me/venues');
export const getMyManagedVenue = (id: string) => api<ManagedVenue>(`/providers/me/venues/${id}`);
export const authorizeVenueImage = (mimeType: 'image/jpeg' | 'image/png' | 'image/webp') => api<VenueUploadAuthorization>('/providers/me/uploads', { method: 'POST', body: JSON.stringify({ mimeType }) });
export async function uploadVenueImage(authorization: VenueUploadAuthorization, file: File, onProgress?: (progress: number) => void): Promise<void> { onProgress?.(0); const response = await fetch(authorization.uploadUrl, { method: 'PUT', headers: authorization.headers, body: file }); if (!response.ok) throw new Error('Không thể tải ảnh cơ sở lên.'); onProgress?.(100) }
export const createManagedVenue = (body: { name: string; lat: number; lng: number; address: string; amenities?: unknown; images?: unknown }) => api<ManagedVenue>('/venues', { method: 'POST', body: JSON.stringify(body) });
export const updateManagedVenue = (id: string, body: Partial<{ name: string; lat: number; lng: number; address: string; amenities: unknown; images: unknown }>) => api<ManagedVenue>(`/venues/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const addManagedCourt = (venueId: string, name: string) => api<ManagedCourt>(`/venues/${venueId}/courts`, { method: 'POST', body: JSON.stringify({ name }) });
export const deactivateManagedCourt = (id: string) => api<{ message: string }>(`/venues/courts/${id}/deactivate`, { method: 'POST' });
export const saveOperatingHours = (id: string, body: { weekday: number; openMinute: number; closeMinute: number }) => api(`/courts/${id}/operating-hours`, { method: 'POST', body: JSON.stringify(body) });
export const addClosure = (id: string, body: { date: string; reason?: string }) => api(`/courts/${id}/closures`, { method: 'POST', body: JSON.stringify(body) });
export const savePricing = (id: string, body: { rules: Array<{ weekday: number; startMinute: number; endMinute: number; price: number }>; effectiveFrom: string }) => api(`/courts/${id}/pricing`, { method: 'POST', body: JSON.stringify(body) });
export const saveBookingRule = (id: string, body: { stepMinutes: number; minDurationMinutes: number; maxDurationMinutes: number }) => api(`/courts/${id}/booking-rule`, { method: 'POST', body: JSON.stringify(body) });
export const getVenueCalendar = (venueId: string, date: string) => api<{ courts: Array<{ id: string; name: string }>; entries: Array<{ id: string; courtId: string; kind: 'booking' | 'hold'; startAt: string; endAt: string }> }>(`/venues/${venueId}/calendar?date=${encodeURIComponent(date)}`);
export const createInternalBooking = (body: { courtId: string; startAt: string; endAt: string; guestName: string; guestContact: string }) => api('/internal-bookings', { method: 'POST', body: JSON.stringify(body) });
export const cancelInternalBooking = (id: string) => api(`/internal-bookings/${id}/cancel`, { method: 'POST' });
export const approveProvider = (id: string) => api<{ message: string }>(`/providers/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
export const rejectProvider = (id: string, reason: string) => api<{ message: string }>(`/providers/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
export const getAdminBookings = (filters: { query?: string; status?: string; from?: string; to?: string } = {}) => {
  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return api<AdminBookingRow[]>(`/admin/bookings${query.size ? `?${query}` : ''}`);
};
export const cancelAdminBooking = (id: string, reason: string) => api(`/admin/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });

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

export async function waitForBookingTerminal(id: string, options: { signal?: AbortSignal; intervalMs?: number; timeoutMs?: number } = {}) {
  const intervalMs = options.intervalMs ?? 750;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const startedAt = Date.now();
  while (true) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const result = await getBookingDetail(id);
    if (result.booking.terminalStatus) return result;
    if (Date.now() - startedAt >= timeoutMs) return result;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, intervalMs);
      options.signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
  }
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
