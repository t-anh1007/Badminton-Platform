import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, EmptyState, Pagination, Skeleton, SurfaceCard } from '../../components/ui.js';
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

const summaryItems = [
  { key: 'all', label: 'Tất cả lượt đặt sân', icon: '▦' },
  { key: 'completed', label: 'Đã hoàn thành', icon: '✓' },
  { key: 'current', label: 'Đang diễn ra', icon: '●' },
  { key: 'future', label: 'Sắp tới', icon: '→' },
] as const;

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
    setParams(query, { replace: true });
  };

  const selectBooking = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('booking', id);
    setParams(next, { replace: true });
  };

  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-bold uppercase tracking-[0.12em] text-ink-500">Vận hành đặt sân</p>
          <h1 className="mt-1 text-h1">Quản lý đặt sân</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            Theo dõi toàn bộ booking trong quá khứ, hiện tại và tương lai của các cơ sở bạn quản lý.
          </p>
        </div>
        <Button tone="ghost" size="sm" onClick={() => void load()}>Tải lại</Button>
      </header>

      {result ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tổng quan lượt đặt sân">
          {summaryItems.map((item) => (
            <SurfaceCard key={item.key} className="relative overflow-hidden">
              <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl bg-green-50 font-bold text-brand-navy" aria-hidden="true">{item.icon}</span>
              <p className="text-sm font-medium text-ink-500">{item.label}</p>
              <p className="text-figures mt-3 text-3xl font-bold text-brand-navy">{result.summary[item.key]}</p>
            </SurfaceCard>
          ))}
        </section>
      ) : loading ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Đang tải tổng quan lượt đặt sân">
          {summaryItems.map((item) => <Skeleton key={item.key} className="h-28" />)}
        </section>
      ) : null}

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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-h3">Danh sách lượt đặt sân</h2>
            <p className="mt-1 text-sm text-ink-500">{result ? `${result.total} booking phù hợp` : 'Đang tải dữ liệu'}</p>
          </div>
          {loading && result ? <span className="text-xs font-semibold text-ink-500">Đang cập nhật…</span> : null}
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

      <ProviderBookingDetailDrawer
        bookingId={validSelectedId}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onClose={closeBooking}
        onRetry={() => void loadDetail()}
      />
    </div>
  );
}
