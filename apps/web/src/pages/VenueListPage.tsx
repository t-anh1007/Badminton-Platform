import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, EmptyState, SelectInput, SurfaceCard, TextInput } from '../components/ui';
import { RouteState } from '../components/RouteState.js';
import { PageHeader } from '../components/courtin/PageHeader';
import { searchVenues, type VenueSearchRow } from '../lib/venueBookingApi';
import { formatMoneyVnd } from '../lib/formatters.js';
import { VenuesMap } from '../components/map/VenuesMap';
import { reverseGeocode } from '../lib/geocoding';

type Origin = { label: string; lat: number; lng: number };
type SortOrder = 'distance' | 'price' | 'name';
type ViewMode = 'list' | 'map';

// Điểm gốc mặc định khi chưa có vị trí (trung tâm TP.HCM). Người dùng thay bằng
// nút "Dùng vị trí của tôi" hoặc click trên bản đồ — không còn preset cứng.
const DEFAULT_ORIGIN: Origin = { label: 'Trung tâm TP.HCM', lat: 10.8231, lng: 106.6297 };
const RADIUS_OPTIONS = [5, 10, 20] as const;

function readCoordinate(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function initialOrigin(searchParams: URLSearchParams): Origin {
  const lat = readCoordinate(searchParams.get('lat'));
  const lng = readCoordinate(searchParams.get('lng'));
  if (lat !== null && lng !== null) return { label: 'Vị trí trên liên kết', lat, lng };
  return DEFAULT_ORIGIN;
}

function formatLowestPrice(price: string | null): string | null {
  if (price === null) return null;
  const value = Number(price);
  return Number.isFinite(value) ? formatMoneyVnd(Math.round(value)) : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể tải danh sách sân. Hãy thử lại.';
}

function parseDateInput(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}` : null;
}

const PRICE_MIN = 0;
const PRICE_MAX = 500_000;
const PRICE_STEP = 10_000;

function minuteOfDay(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function VenueListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [origin, setOrigin] = useState<Origin>(() => initialOrigin(searchParams));
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterOpen, setFilterOpen] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(() => {
    const value = Number(searchParams.get('radiusKm'));
    return RADIUS_OPTIONS.includes(value as (typeof RADIUS_OPTIONS)[number]) ? value : 10;
  });
  const [nameFilter, setNameFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('distance');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [venues, setVenues] = useState<VenueSearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const searchRequestId = useRef(0);

  const runSearch = useCallback(async (validateAvailability = false) => {
    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;
    setLoading(true);
    setLoadError(null);
    const availabilityUsed = Boolean(date || startTime || endTime);
    const parsedDate = date ? parseDateInput(date) : null;
    const startMinute = startTime ? minuteOfDay(startTime) : null;
    const endMinute = endTime ? minuteOfDay(endTime) : null;
    if (validateAvailability && availabilityUsed && (!parsedDate || startMinute === null || endMinute === null || startMinute >= endMinute)) {
      setVenues([]);
      setLoadError('Nhập đủ ngày dd/MM/yyyy và khoảng giờ bắt đầu–kết thúc hợp lệ.');
      setLoading(false);
      return;
    }
    try {
      const result = await searchVenues({
        lat: origin.lat,
        lng: origin.lng,
        radiusKm,
        ...(minPrice ? { minPrice: Number(minPrice) } : {}),
        ...(maxPrice ? { maxPrice: Number(maxPrice) } : {}),
        ...(sortOrder !== 'name' ? { sortBy: sortOrder } : {}),
        ...(parsedDate && startMinute !== null && endMinute !== null ? { date: parsedDate, startMinute, endMinute } : {}),
      });
      if (requestId === searchRequestId.current) setVenues(result);
    } catch (error) {
      if (requestId === searchRequestId.current) {
        setVenues([]);
        setLoadError(errorMessage(error));
      }
    } finally {
      if (requestId === searchRequestId.current) setLoading(false);
    }
  }, [date, endTime, origin.lat, origin.lng, maxPrice, minPrice, radiusKm, sortOrder, startTime]);

  useEffect(() => {
    void runSearch(false);
  }, [runSearch]);

  useEffect(() => {
    const nextParams = new URLSearchParams({
      lat: String(origin.lat),
      lng: String(origin.lng),
      radiusKm: String(radiusKm),
    });
    setSearchParams(nextParams, { replace: true });
  }, [origin.lat, origin.lng, radiusKm, setSearchParams]);

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) { setLocateError('Trình duyệt không hỗ trợ định vị.'); return; }
    setLocating(true); setLocateError('');
    let settled = false;
    const finish = () => { if (!settled) { settled = true; setLocating(false); } };
    // Safety net: một số trình duyệt (Edge/Chrome khi user chưa bấm cho phép) không
    // gọi callback đúng hạn timeout gốc → tự thoát trạng thái "Đang định vị…"
    // sau 12s để nút không kẹt.
    const safety = window.setTimeout(() => {
      if (!settled) {
        setLocateError('Không nhận được vị trí trong 12s. Hãy kiểm tra quyền vị trí của trình duyệt hoặc click trên bản đồ.');
        finish();
      }
    }, 12000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(safety);
        const { latitude, longitude } = position.coords;
        setOrigin({ label: 'Vị trí của bạn', lat: latitude, lng: longitude });
        finish();
        void reverseGeocode(latitude, longitude).then((addr) => {
          if (addr) setOrigin((current) => (current.lat === latitude && current.lng === longitude ? { ...current, label: addr } : current));
        });
      },
      (error) => {
        window.clearTimeout(safety);
        setLocateError(
          error.code === error.PERMISSION_DENIED
            ? 'Bạn đã từ chối quyền vị trí. Hãy click trên bản đồ để chọn điểm.'
            : error.code === error.TIMEOUT
              ? 'Định vị quá lâu. Hãy thử lại hoặc click trên bản đồ.'
              : 'Không lấy được vị trí. Hãy click trên bản đồ để chọn điểm.',
        );
        finish();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const pickOriginOnMap = (lat: number, lng: number) => {
    setOrigin({ label: 'Điểm đã chọn trên bản đồ', lat, lng });
    setLocateError('');
    void reverseGeocode(lat, lng).then((addr) => {
      if (addr) setOrigin((current) => (current.lat === lat && current.lng === lng ? { ...current, label: addr } : current));
    });
  };

  const visibleVenues = useMemo(() => {
    const normalizedFilter = nameFilter.trim().toLocaleLowerCase('vi-VN');
    const filtered = normalizedFilter.length === 0
      ? venues
      : venues.filter((venue) => venue.name.toLocaleLowerCase('vi-VN').includes(normalizedFilter));
    return [...filtered].sort((left, right) => (
      sortOrder === 'distance'
        ? left.distanceKm - right.distanceKm
        : sortOrder === 'price'
          ? Number(left.lowestPrice ?? Number.MAX_SAFE_INTEGER) - Number(right.lowestPrice ?? Number.MAX_SAFE_INTEGER)
          : left.name.localeCompare(right.name, 'vi')
    ));
  }, [nameFilter, sortOrder, venues]);

  return (
    <main className="min-h-screen bg-canvas pb-12 pt-8 sm:pt-10">
      <div className="page-container">
        <PageHeader eyebrow="Đặt sân cầu lông" title="Sân cầu lông gần bạn" description="Chọn vị trí của bạn bằng định vị hoặc bản đồ, lọc theo bán kính, giá và khung giờ." />

        <div className="sticky top-[76px] z-10 my-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Button type="button" tone="secondary" size="sm" onClick={() => setFilterOpen((prev) => !prev)} aria-expanded={filterOpen} aria-controls="venue-filter-panel">
              {filterOpen ? '▲ Ẩn bộ lọc' : '▼ Hiện bộ lọc'}
            </Button>
            {!filterOpen && (
              <span className="text-xs text-ink-500">
                {origin.label} · {radiusKm} km{minPrice || maxPrice ? ` · ${minPrice ? formatMoneyVnd(minPrice) : '0đ'}–${maxPrice ? formatMoneyVnd(maxPrice) : '∞'}` : ''}
              </span>
            )}
          </div>
          {filterOpen && (
            <form
              id="venue-filter-panel"
              className="surface-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(event) => { event.preventDefault(); void runSearch(true); }}
            >
              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-caption">Vị trí tìm kiếm</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" tone="secondary" size="sm" onClick={useMyLocation} disabled={locating}>{locating ? 'Đang định vị…' : '📍 Dùng vị trí của tôi'}</Button>
                  <span className="truncate text-sm text-ink-600" title={origin.label}>{origin.label}</span>
                </div>
                {locateError && <p className="mt-1 text-xs text-danger">{locateError}</p>}
              </div>
              <div>
                <label htmlFor="venue-name" className="mb-1.5 block text-caption">Tên sân</label>
                <TextInput id="venue-name" value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} placeholder="Tìm theo tên sân" />
              </div>
              <div>
                <label htmlFor="venue-radius" className="mb-1.5 block text-caption">Bán kính</label>
                <SelectInput id="venue-radius" value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))}>
                  {RADIUS_OPTIONS.map((option) => <option key={option} value={option}>{option} km</option>)}
                </SelectInput>
              </div>
              <div>
                <label htmlFor="venue-sort" className="mb-1.5 block text-caption">Sắp xếp</label>
                <SelectInput id="venue-sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
                  <option value="distance">Gần nhất</option>
                  <option value="price">Giá thấp nhất</option>
                  <option value="name">Tên sân</option>
                </SelectInput>
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <div className="mb-1.5 flex items-center justify-between text-caption">
                  <span>Khoảng giá / giờ</span>
                  <span className="text-figures text-ink-700">
                    {minPrice ? formatMoneyVnd(minPrice) : '0đ'} – {maxPrice ? formatMoneyVnd(maxPrice) : `${formatMoneyVnd(String(PRICE_MAX))}+`}
                  </span>
                </div>
                <div className="relative h-10">
                  <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-100" aria-hidden="true" />
                  {(() => {
                    const lo = Math.max(PRICE_MIN, Math.min(PRICE_MAX, Number(minPrice) || PRICE_MIN));
                    const hi = Math.max(PRICE_MIN, Math.min(PRICE_MAX, Number(maxPrice) || PRICE_MAX));
                    const left = (lo / PRICE_MAX) * 100;
                    const right = 100 - (hi / PRICE_MAX) * 100;
                    return <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-navy" style={{ left: `${left}%`, right: `${right}%` }} aria-hidden="true" />;
                  })()}
                  <input
                    type="range" aria-label="Giá tối thiểu"
                    min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP}
                    value={Number(minPrice) || PRICE_MIN}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      const cap = Number(maxPrice) || PRICE_MAX;
                      setMinPrice(String(Math.min(next, cap)));
                    }}
                    className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand-navy [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-navy"
                  />
                  <input
                    type="range" aria-label="Giá tối đa"
                    min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP}
                    value={Number(maxPrice) || PRICE_MAX}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      const floor = Number(minPrice) || PRICE_MIN;
                      setMaxPrice(String(Math.max(next, floor)));
                    }}
                    className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand-navy [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-navy"
                  />
                </div>
                <div className="mt-1 flex gap-2">
                  <TextInput aria-label="Giá tối thiểu (nhập tay)" inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ''))} placeholder="0" />
                  <TextInput aria-label="Giá tối đa (nhập tay)" inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ''))} placeholder={String(PRICE_MAX)} />
                  {(minPrice || maxPrice) && (
                    <Button type="button" tone="ghost" size="sm" onClick={() => { setMinPrice(''); setMaxPrice(''); }}>Xoá</Button>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="venue-date" className="mb-1.5 block text-caption">Ngày chơi</label>
                <TextInput id="venue-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2"><label className="grid gap-1.5 text-caption">Từ giờ<TextInput aria-label="Giờ bắt đầu" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label className="grid gap-1.5 text-caption">Đến giờ<TextInput aria-label="Giờ kết thúc" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div>
              <Button type="submit" className="self-end lg:col-span-4 lg:justify-self-end" disabled={loading}>Tìm sân</Button>
            </form>
          )}
        </div>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div><p className="courtin-kicker">Khả dụng hôm nay</p><h2 className="mt-1 text-h2">Chọn sân phù hợp gần bạn</h2></div>
          <div className="flex items-center gap-3">
            {!loading && !loadError && <p className="text-sm text-ink-500"><span className="text-figures text-ink-900">{visibleVenues.length}</span> sân</p>}
            <div className="inline-flex overflow-hidden rounded-full border border-line" role="tablist" aria-label="Chế độ hiển thị">
              <button type="button" role="tab" aria-selected={viewMode === 'list'} onClick={() => setViewMode('list')} className={`px-4 py-1.5 text-sm font-semibold ${viewMode === 'list' ? 'bg-brand-navy text-surface' : 'text-ink-600'}`}>Danh sách</button>
              <button type="button" role="tab" aria-selected={viewMode === 'map'} onClick={() => setViewMode('map')} className={`px-4 py-1.5 text-sm font-semibold ${viewMode === 'map' ? 'bg-brand-navy text-surface' : 'text-ink-600'}`}>Bản đồ</button>
            </div>
          </div>
        </div>

        {loadError && (
          <RouteState variant="error" title="Không thể tìm sân" description={loadError} onRetry={() => void runSearch(true)} />
        )}

        {loading && (
          <RouteState variant="loading" title="Đang tìm sân phù hợp" />
        )}

        {!loading && !loadError && viewMode === 'map' && (
          <div className="grid gap-2">
            <p className="text-sm text-ink-500">Click lên bản đồ để đổi điểm tìm kiếm. Marker xanh là vị trí của bạn.</p>
            <VenuesMap
              origin={{ lat: origin.lat, lng: origin.lng }}
              venues={visibleVenues.map((venue) => ({ venueId: venue.venueId, name: venue.name, address: venue.address, lat: venue.lat, lng: venue.lng, distanceKm: venue.distanceKm, lowestPrice: venue.lowestPrice }))}
              onPickOrigin={pickOriginOnMap}
            />
          </div>
        )}

        {!loading && !loadError && viewMode === 'list' && visibleVenues.length === 0 && (
          <EmptyState
            title={nameFilter.trim() ? 'Không tìm thấy sân theo tên này' : 'Không có sân trong bán kính này'}
            description={nameFilter.trim() ? 'Thử bỏ bớt từ khóa hoặc chọn khu vực khác.' : 'Hãy thử mở rộng bán kính tìm kiếm.'}
            action={radiusKm < 20 ? <Button tone="secondary" onClick={() => setRadiusKm(20)}>Mở rộng lên 20 km</Button> : undefined}
          />
        )}

        {!loading && !loadError && viewMode === 'list' && visibleVenues.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleVenues.map((venue) => {
              const lowestPrice = formatLowestPrice(venue.lowestPrice);
              return (
                <Link key={venue.venueId} to={`/venues/${encodeURIComponent(venue.venueId)}`} className="block rounded-2xl focus-visible:outline-none">
                  <SurfaceCard hoverable className="h-full overflow-hidden !p-0">
                    <div className="flex h-full flex-col">
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink-100">
                        {venue.coverImage ? (
                          <img src={venue.coverImage} alt={`Ảnh ${venue.name}`} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-ink-400" aria-hidden="true">🏸</div>
                        )}
                        <Badge tone="success" className="absolute right-3 top-3">Đặt được</Badge>
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        <p className="text-caption text-brand-navy">Sân cầu lông</p>
                        <h2 className="mt-1 text-h3 text-ink-900">{venue.name}</h2>
                        <p className="mt-2 text-sm leading-6 text-ink-500">{venue.address}</p>
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-sm">
                          <span className="text-figures text-ink-700">~{venue.distanceKm.toFixed(1)} km</span>
                          {lowestPrice && <span className="text-figures font-medium text-brand-navy">Từ {lowestPrice}</span>}
                        </div>
                      </div>
                    </div>
                  </SurfaceCard>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
