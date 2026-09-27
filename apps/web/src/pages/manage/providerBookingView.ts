import type { ProviderBookingStatus, ProviderBookingTimeScope } from '../../lib/venueBookingApi.js';

export interface ProviderBookingPageFilters {
  query: string;
  venueId: string;
  courtId: string;
  status: '' | ProviderBookingStatus;
  timeScope: ProviderBookingTimeScope;
  from: string;
  to: string;
  page: number;
  pageSize: number;
}

const statuses = new Set(['held', 'confirmed', 'completed', 'cancelled']);
const scopes = new Set(['all', 'past', 'current', 'future']);

const positiveInt = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function readProviderBookingFilters(params: URLSearchParams): ProviderBookingPageFilters {
  const status = params.get('status') ?? '';
  const timeScope = params.get('timeScope') ?? 'all';
  return {
    query: params.get('query') ?? '',
    venueId: params.get('venueId') ?? '',
    courtId: params.get('courtId') ?? '',
    status: statuses.has(status) ? status as ProviderBookingStatus : '',
    timeScope: scopes.has(timeScope) ? timeScope as ProviderBookingTimeScope : 'all',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    page: positiveInt(params.get('page'), 1),
    pageSize: positiveInt(params.get('pageSize'), 20),
  };
}

export function writeProviderBookingFilters(filters: ProviderBookingPageFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === '' || value === 'all' || value === 1 || (key === 'pageSize' && value === 20)) continue;
    params.set(key, String(value));
  }
  return params;
}

export const providerBookingStatusLabel = (status: ProviderBookingStatus, matchDepositPaid: boolean) =>
  status === 'held'
    ? (matchDepositPaid ? 'Đã đặt cọc' : 'Chờ thanh toán')
    : status === 'confirmed'
      ? 'Đã xác nhận'
      : status === 'completed'
        ? 'Đã hoàn thành'
        : 'Đã hủy';

export const providerBookingBadgeTone = (
  status: ProviderBookingStatus,
): 'success' | 'warning' | 'danger' | 'neutral' =>
  status === 'completed'
    ? 'success'
    : status === 'held'
      ? 'warning'
      : status === 'cancelled'
        ? 'danger'
        : 'neutral';
