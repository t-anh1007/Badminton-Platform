import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, EmptyState, Pagination, SegmentedControl, Skeleton, SurfaceCard } from '../../components/ui.js';
import { ManageCalendarPage } from './ManageCalendarPage.js';
import type { ProviderBookingTimeScope } from '../../lib/venueBookingApi.js';
import {
  getMyManagedVenues,
  getProviderBookingDetail,
  getProviderBookings,
  type ManagedVenue,
  type ProviderBookingDetail,
  type ProviderBookingFilters as ApiFilters,
  type ProviderBookingsResult,
} from '../../lib/venueBookingApi.js';
import { useLiveDataRefresh } from '../../realtime/dataInvalidation.js';
import { ProviderBookingFilters } from './ProviderBookingFilters.js';
import { ProviderBookingDetailDrawer } from './ProviderBookingDetailDrawer.js';
import { ProviderBookingTable } from './ProviderBookingTable.js';
import {
  readProviderBookingFilters,
  writeProviderBookingFilters,
  type ProviderBookingPageFilters,
} from './providerBookingView.js';

const emptyFilters = () => readProviderBookingFilters(new URLSearchParams());
const bookingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Ô tổng kiêm bộ lọc khoảng thời gian.
const scopeTiles: ReadonlyArray<{ scope: ProviderBookingTimeScope; label: string }> = [
  { scope: 'all', label: 'Tất cả' },
  { scope: 'future', label: 'Sắp tới' },
  { scope: 'current', label: 'Đang diễn ra' },
  { scope: 'past', label: 'Đã qua' },
];

function toApiFilters(filters: ProviderBookingPageFilters): ApiFilters {
  return {
    query: filters.query || undefined,
    venueId: filters.venueId || undefined,
    courtId: filters.courtId || undefined,
    status: filters.status || undefined,
    timeScope: filters.timeScope,
    from: filters.from || undefined,
    to: filters.to || undefined,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export function ManageBookingsPage() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readProviderBookingFilters(params), [params]);
  const [result, setResult] = useState<ProviderBookingsResult | null>(null);
  const [venues, setVenues] = useState<ManagedVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<ProviderBookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const detailRequestRef = useRef(0);
  const selectedId = params.get('booking');
  const view = params.get('view') === 'calendar' ? 'calendar' : 'list';
  const validSelectedId = selectedId && bookingIdPattern.test(selectedId) ? selectedId : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getProviderBookings(toApiFilters(filters));
      setResult(next);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải lượt đặt sân.');
    } finally {
      setLoading(false);
    }
  }, [filters.query, filters.venueId, filters.courtId, filters.status, filters.timeScope, filters.from, filters.to, filters.page, filters.pageSize]);

  useEffect(() => {
    void getMyManagedVenues()
      .then(setVenues)
      .catch(() => setVenues([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeBooking = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete('booking');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const loadDetail = useCallback(async () => {
    if (!validSelectedId) return;
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    setDetailError('');
    try {
      const next = await getProviderBookingDetail(validSelectedId);
      if (requestId !== detailRequestRef.current) return;
      setDetail(next);
    } catch (cause) {
      if (requestId !== detailRequestRef.current) return;
      const message = cause instanceof Error ? cause.message : 'Không thể tải chi tiết lượt đặt sân.';
      // Rẽ nhánh theo mã lỗi, không theo câu chữ (câu chữ có thể được sửa bất cứ lúc nào).
      if ((cause as { code?: string } | null)?.code === 'BOOKING_NOT_FOUND') {
        setNotice('Lượt đặt sân này không còn khả dụng. Danh sách đã được cập nhật.');
        closeBooking();
      } else {
        setDetail(null);
        setDetailError(message);
      }
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, [closeBooking, validSelectedId]);

  useEffect(() => {
    if (selectedId && !validSelectedId) {
      closeBooking();
      return;
    }
    if (!validSelectedId) {
      detailRequestRef.current += 1;
      setDetail(null);
      setDetailError('');
      setDetailLoading(false);
      return;
    }
    setDetail(null);
    void loadDetail();
    return () => { detailRequestRef.current += 1; };
  }, [selectedId, validSelectedId, closeBooking, loadDetail]);

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), validSelectedId ? loadDetail() : Promise.resolve()]);
  }, [load, loadDetail, validSelectedId]);

  useLiveDataRefresh(refreshAll);

  const updateFilters = (next: ProviderBookingPageFilters) => {
    const query = writeProviderBookingFilters(next);
    if (validSelectedId) query.set('booking', validSelectedId);
    if (view === 'calendar') query.set('view', 'calendar');
    setParams(query, { replace: true });
  };

  const selectBooking = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('booking', id);
    setParams(next, { replace: true });
  };

  const setView = (next: 'list' | 'calendar') => {
    const query = new URLSearchParams(params);
    if (next === 'calendar') query.set('view', 'calendar'); else query.delete('view');
    setParams(query, { replace: true });
  };
  const scopeCount = (scope: ProviderBookingTimeScope) => !result ? null : scope === 'past' ? Math.max(0, result.summary.all - result.summary.current - result.summary.future) : result.summary[scope];

  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2">Đặt sân</h1>
        <SegmentedControl options={[{ value: 'calendar', label: 'Lịch' }, { value: 'list', label: 'Danh sách' }]} value={view} onChange={setView} />
      </header>

      {view === 'calendar' ? <ManageCalendarPage onSelect={selectBooking} /> : <>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Khoảng thời gian">
        {scopeTiles.map((tile) => {
          const count = scopeCount(tile.scope);
          return (
            <button key={tile.scope} type="button" aria-label={tile.label} aria-pressed={filters.timeScope === tile.scope} onClick={() => updateFilters({ ...filters, timeScope: tile.scope, page: 1 })}
              className={`surface-card px-4 py-3 text-left transition ${filters.timeScope === tile.scope ? 'border-brand-navy ring-4 ring-green-100' : 'hover:border-ink-300'}`}>
              <span className="block text-sm text-ink-500">{tile.label}</span>
              {count === null ? <Skeleton className="mt-1 h-8 w-12" /> : <span className="text-figures mt-1 block text-2xl font-semibold text-brand-navy">{count}</span>}
            </button>
          );
        })}
      </section>

      <ProviderBookingFilters
        value={filters}
        venues={venues}
        onChange={updateFilters}
        onClear={() => updateFilters(emptyFilters())}
      />

      {error ? (
        <div role="alert" className="rounded-2xl border border-danger/20 bg-danger-bg p-4 text-sm text-danger">
          <p>{error}</p>
          <Button tone="secondary" size="sm" className="mt-3" onClick={() => void load()}>Thử lại</Button>
        </div>
      ) : null}

      {notice ? <p role="status" className="rounded-2xl bg-warning-bg p-4 text-sm text-warning">{notice}</p> : null}

      <SurfaceCard className="overflow-hidden p-0 sm:p-0">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm text-ink-500 sm:px-5">
          <span>{result ? `${result.total} lượt đặt sân` : 'Đang tải…'}</span>
          {loading && result ? <span className="text-xs font-semibold">Đang cập nhật…</span> : null}
        </div>

        {loading && !result ? (
          <div className="grid gap-3 p-5">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : result?.items.length ? (
          <ProviderBookingTable rows={result.items} onSelect={selectBooking} />
        ) : !error ? (
          <div className="p-5">
            <EmptyState
              title="Không có lượt đặt sân phù hợp"
              description="Thử đổi khoảng thời gian hoặc xóa bớt bộ lọc."
              action={<Button tone="secondary" onClick={() => updateFilters(emptyFilters())}>Xóa bộ lọc</Button>}
            />
          </div>
        ) : null}

        {result && result.total > 0 ? (
          <div className="border-t border-line px-4 py-4">
            <Pagination
              page={result.page}
              pageCount={pageCount}
              onChange={(page) => updateFilters({ ...filters, page })}
            />
          </div>
        ) : null}
      </SurfaceCard>
      </>}

      <ProviderBookingDetailDrawer
        bookingId={validSelectedId}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onClose={closeBooking}
        onRetry={() => void loadDetail()}
        onChanged={refreshAll}
      />
    </div>
  );
}
