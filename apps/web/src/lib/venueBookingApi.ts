import { publishDataInvalidation } from '../realtime/dataInvalidation.js';
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
  if (init?.method && init.method !== 'GET') publishDataInvalidation();
  return body;
}

export interface BookingSummary {
  id: string;
  businessCode?: string;
  createdAt?: string;
  cancellationReason?: 'self' | 'provider_fault' | 'platform_admin' | null;
  cancellationRefundPercent?: number | null;
  shutdownRefundStatus?: 'processing' | 'completed' | 'needs_attention' | 'not_paid' | null;
  courtId: string;
  startAt: string;
  endAt: string;
  status: string;
  priceSnapshot: string;
  holdExpiresAt?: string | null;
  matchDepositPaid?: boolean;
  terminalStatus?: 'confirmed' | 'cancelled' | null;
  court?: { name: string; venue?: { name: string; address?: string } };
}

export interface VenueSearchRow {
  venueId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  amenities: unknown;
  coverImage: string | null;
  distanceKm: number;
  lowestPrice: string | null;
  courtCount: number;
}

export interface VenueDetail {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  amenities: unknown;
  images: unknown;
  courts: Array<{ id: string; name: string; images: string[]; bookingRule: CourtBookingRule | null }>;
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
export interface ManagedCourt { id: string; name: string; active: boolean; images: Array<{ objectKey: string; url: string }>; configuration: { operatingHours: number; pricingRules: number; bookingRule: boolean }; operatingHours: Array<{ id: string; weekday: number; openMinute: number; closeMinute: number }>; closures: Array<{ id: string; date: string; reason: string | null }>; pricingRules: Array<{ id: string; weekday: number; startMinute: number; endMinute: number; price: string; version: number; effectiveFrom: string }>; bookingRule: { stepMinutes: number; minDurationMinutes: number; maxDurationMinutes: number } | null }
export interface ManagedVenue { id: string; name: string; address: string; lat: number; lng: number; amenities: unknown; images: unknown; courts: ManagedCourt[] }
export type OperationalShutdownMode = 'winding_down' | 'scheduled_close' | 'emergency';
export type OperationalShutdownScope = 'venue' | 'court';
export interface OperationalShutdownInput { mode: OperationalShutdownMode; closeDate?: string; reason?: string }
export interface OperationalShutdownPreview {
  affectedMarketplace: number;
  affectedMatch: number;
  affectedInternal: number;
  activeCheckoutHolds: number;
  activeMatchHolds: number;
  existingConfirmedBookings: number;
  continuingBookings: number;
  closeAt: string | null;
  estimatedRefund: string;
  estimatedRefundExcludesUnsettledMatches: boolean;
  expectedInactiveAt: string | null;
  effectiveAt: string | null;
  previewToken: string;
}
export interface OperationalShutdownStatus {
  id: string;
  mode: OperationalShutdownMode;
  operationalStatus: 'winding_down' | 'scheduled_close' | 'inactive';
  resolutionStatus: 'not_required' | 'processing' | 'completed' | 'needs_attention';
  effectiveAt: string | null;
  expectedInactiveAt: string | null;
  counts: Record<string, number>;
}
export interface VenueUploadAuthorization { objectKey: string; uploadUrl: string; headers: Record<string, string>; expiresAt: string }
export interface AdminBookingRow { id: string; businessCode: string; status: string; startAt: string; endAt: string; priceSnapshot: string; holdExpiresAt: string | null; matchDepositPaid: boolean; player: { label: string }; court: { id: string; name: string; venue: { id: string; name: string; address: string } } }

export function searchVenues(params: { lat: number; lng: number; radiusKm?: number; minPrice?: number; maxPrice?: number; sortBy?: 'distance' | 'price'; date?: string; startMinute?: number; endMinute?: number }) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, String(value));
  });
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
export const getOperationalShutdown = (scope: OperationalShutdownScope, id: string) =>
  api<OperationalShutdownStatus | null>(`/operational-shutdowns/${scope}/${id}`);
export const previewOperationalShutdown = (scope: OperationalShutdownScope, id: string, input: OperationalShutdownInput) =>
  api<OperationalShutdownPreview>(`/operational-shutdowns/${scope}/${id}/preview`, { method: 'POST', body: JSON.stringify(input) });
export const confirmOperationalShutdown = (scope: OperationalShutdownScope, id: string, input: OperationalShutdownInput, previewToken: string) =>
  api<{ shutdown: OperationalShutdownStatus; preview: OperationalShutdownPreview }>(`/operational-shutdowns/${scope}/${id}/confirm`, {
    method: 'POST', body: JSON.stringify({ ...input, previewToken }),
  });
export const reactivateOperationalShutdown = (scope: OperationalShutdownScope, id: string) =>
  api<{ status: 'active'; restoredCourtCount: number }>(`/operational-shutdowns/${scope}/${id}/reactivate`, { method: 'POST' });
export const authorizeVenueImage = (mimeType: 'image/jpeg' | 'image/png' | 'image/webp') => api<VenueUploadAuthorization>('/providers/me/uploads', { method: 'POST', body: JSON.stringify({ mimeType }) });
export async function uploadVenueImage(authorization: VenueUploadAuthorization, file: File, onProgress?: (progress: number) => void): Promise<void> { onProgress?.(0); const response = await fetch(authorization.uploadUrl, { method: 'PUT', headers: authorization.headers, body: file }); if (!response.ok) throw new Error('Không thể tải ảnh cơ sở lên.'); onProgress?.(100) }
export const createManagedVenue = (body: { name: string; lat: number; lng: number; address: string; amenities?: unknown; images?: unknown }) => api<ManagedVenue>('/venues', { method: 'POST', body: JSON.stringify(body) });
export const updateManagedVenue = (id: string, body: Partial<{ name: string; lat: number; lng: number; address: string; amenities: unknown; images: unknown }>) => api<ManagedVenue>(`/venues/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deactivateManagedVenue = (id: string) => api<{ message: string; count: number }>(`/venues/${id}/deactivate`, { method: 'POST' });
export const activateManagedVenue = (id: string) => api<{ message: string; count: number }>(`/venues/${id}/activate`, { method: 'POST' });
export const addManagedCourt = (venueId: string, name: string, images: Array<{ objectKey: string }>) => api<ManagedCourt>(`/venues/${venueId}/courts`, { method: 'POST', body: JSON.stringify({ name, images }) });
export const updateManagedCourt = (courtId: string, body: Partial<{ name: string; images: Array<{ objectKey: string }> }>) => api<ManagedCourt>(`/venues/courts/${courtId}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deactivateManagedCourt = (id: string) => api<{ message: string }>(`/venues/courts/${id}/deactivate`, { method: 'POST' });
export const activateManagedCourt = (id: string) => api<{ message: string }>(`/venues/courts/${id}/activate`, { method: 'POST' });
export const saveOperatingHours = (id: string, body: { weekday: number; openMinute: number; closeMinute: number }) => api(`/courts/${id}/operating-hours`, { method: 'POST', body: JSON.stringify(body) });
export const replaceOperatingHours = (id: string, hours: Array<{ weekday: number; openMinute: number; closeMinute: number }>) => api(`/courts/${id}/operating-hours`, { method: 'PUT', body: JSON.stringify({ hours }) });
export const addClosure = (id: string, body: { date: string; reason?: string }) => api(`/courts/${id}/closures`, { method: 'POST', body: JSON.stringify(body) });
export const savePricing = (id: string, body: { rules: Array<{ weekday: number; startMinute: number; endMinute: number; price: number }>; effectiveFrom: string }) => api(`/courts/${id}/pricing`, { method: 'POST', body: JSON.stringify(body) });
export const saveBookingRule = (id: string, body: { stepMinutes: number; minDurationMinutes: number; maxDurationMinutes: number }) => api(`/courts/${id}/booking-rule`, { method: 'POST', body: JSON.stringify(body) });
export const getVenueCalendar = (venueId: string, date: string) => api<{ courts: Array<{ courtId: string; courtName: string; closedAllDay: boolean }>; entries: Array<{ id?: string; courtId: string; kind: 'booking' | 'hold'; source?: 'marketplace' | 'internal'; startAt: string; endAt: string; customerLabel?: string; guestContact?: string | null; priceSnapshot?: string }> }>(`/venues/${venueId}/calendar?date=${encodeURIComponent(date)}`);
export const createInternalBooking = (body: { courtId: string; startAt: string; endAt: string; guestName: string; guestContact: string }) => api('/internal-bookings', { method: 'POST', body: JSON.stringify(body) });
export const cancelInternalBooking = (id: string) => api(`/internal-bookings/${id}/cancel`, { method: 'POST' });
export const approveProvider = (id: string) => api<{ message: string }>(`/providers/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
export const rejectProvider = (id: string, reason: string) => api<{ message: string }>(`/providers/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
export interface AdminBookingsResult { items: AdminBookingRow[]; total: number; page: number; pageSize: number }

export type ProviderBookingTimeScope = 'all' | 'past' | 'current' | 'future';
export type ProviderBookingStatus = 'held' | 'confirmed' | 'completed' | 'cancelled';
export interface ProviderBookingFilters {
  query?: string;
  venueId?: string;
  courtId?: string;
  status?: ProviderBookingStatus;
  timeScope?: ProviderBookingTimeScope;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
export interface ProviderBookingRow {
  id: string;
  businessCode: string;
  source: 'marketplace' | 'internal';
  status: ProviderBookingStatus;
  startAt: string;
  endAt: string;
  priceSnapshot: string;
  holdExpiresAt: string | null;
  cancellationReason: 'self' | 'provider_fault' | 'platform_admin' | null;
  matchDepositPaid: boolean;
  manualCustomerNotificationRequired: boolean;
  customer: { label: string; guestContact?: string };
  court: { id: string; name: string; venue: { id: string; name: string; address: string } };
}
export interface ProviderBookingDetail extends ProviderBookingRow {
  cancellationRefundPercent: number | null;
  courtChangedAt: string | null;
}
export interface ProviderBookingsResult {
  items: ProviderBookingRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { all: number; completed: number; current: number; future: number };
}

export function getProviderBookings(filters: ProviderBookingFilters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== 'all') query.set(key, String(value));
  });
  return api<ProviderBookingsResult>(`/providers/me/bookings${query.size ? `?${query}` : ''}`);
}

export const getProviderBookingDetail = (id: string) =>
  api<ProviderBookingDetail>(`/providers/me/bookings/${encodeURIComponent(id)}`);

export const getAdminBookings = (filters: { query?: string; status?: string; from?: string; to?: string; page?: number; pageSize?: number } = {}) => {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, String(value)); });
  return api<AdminBookingsResult>(`/admin/bookings${query.size ? `?${query}` : ''}`);
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

export function abandonMyBooking(id: string) {
  return api<{ status: 'cancelled'; refundPercent: number }>(`/players/me/bookings/${id}/cancel`, { method: 'POST', keepalive: true });
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
