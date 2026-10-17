import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, Pagination, SelectInput, Skeleton, TextInput } from '../components/ui';
import { Icon } from '../components/Icon';
import { RouteState } from '../components/RouteState.js';
import { PageHeader } from '../components/courtin/PageHeader';
import { searchVenues, type VenueSearchRow } from '../lib/venueBookingApi';
import { formatMoneyVnd } from '../lib/formatters.js';
import { VenuesMap } from '../components/map/VenuesMap';
import { ipLocate, reverseGeocode } from '../lib/geocoding';

type Origin = { label: string; lat: number; lng: number };
type SortOrder = 'distance' | 'price' | 'name';
type ViewMode = 'list' | 'map';

// Điểm gốc mặc định khi chưa có vị trí (trung tâm TP.HCM). Người dùng thay bằng
// nút "Dùng vị trí của tôi" hoặc click trên bản đồ — không còn preset cứng.
const DEFAULT_ORIGIN: Origin = { label: 'Trung tâm TP.HCM', lat: 10.8231, lng: 106.6297 };
const RADIUS_OPTIONS = [5, 10, 20] as const;
const CURRENT_LOCATION_SESSION_KEY = 'courtin.venue-search.current-location';

function readCoordinate(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadCurrentLocation(): Origin | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(CURRENT_LOCATION_SESSION_KEY) ?? 'null') as Partial<Origin> | null;
    const { label, lat, lng } = value ?? {};
    if (typeof label !== 'string' || typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { label, lat, lng };
  } catch {
    return null;
  }
}

function saveCurrentLocation(location: Origin) {
  try {
    sessionStorage.setItem(CURRENT_LOCATION_SESSION_KEY, JSON.stringify(location));
  } catch {
    // Location persistence is a convenience only; the active page still works.
  }
}

function coordinateLabel(latitude: number, longitude: number) {
  return `Vị trí của bạn · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function initialOrigin(searchParams: URLSearchParams): Origin {
  const lat = readCoordinate(searchParams.get('lat'));
  const lng = readCoordinate(searchParams.get('lng'));
  if (lat !== null && lng !== null) return { label: 'Vị trí trên liên kết', lat, lng };
  return loadCurrentLocation() ?? DEFAULT_ORIGIN;
}

function formatLowestPrice(price: string | null): string | null {
  if (price === null) return null;
  const value = Number(price);
  return Number.isFinite(value) && value > 0 ? formatMoneyVnd(Math.round(value)) : null;
}

function errorMessage(): string {
  // Không in thẳng thông báo của máy chủ (có thể là tiếng Anh/kỹ thuật).
  return 'Máy chủ đang bận hoặc kết nối bị gián đoạn. Hãy thử lại.';
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
// Chế độ chọn cơ sở nằm trong màn tạo kèo nên chỉ hiện từng trang ngắn.
const PICK_PAGE = 12;
const PAGE_SIZE = 12;

function minuteOfDay(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** `onSelectVenue`: chế độ chọn cơ sở (màn tạo kèo) — bấm thẻ/ghim là chọn, không mở trang cơ sở, không ghi URL. */
export function VenueListPage({ embedded = false, initialViewMode = 'list', onSelectVenue }: { embedded?: boolean; initialViewMode?: ViewMode; onSelectVenue?: (venue: VenueSearchRow) => void } = {}) {
  const picking = Boolean(onSelectVenue);
  const [pickLimit, setPickLimit] = useState(PICK_PAGE);
  const [searchParams, setSearchParams] = useSearchParams();
  const [origin, setOrigin] = useState<Origin>(() => initialOrigin(searchParams));
  const [currentLocation, setCurrentLocation] = useState<Origin | null>(() => loadCurrentLocation());
  const [, setSelectedLocation] = useState<Origin | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [priceOpen, setPriceOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [radiusKm, setRadiusKm] = useState<number | null>(() => {
    const value = Number(searchParams.get('radiusKm'));
    return RADIUS_OPTIONS.includes(value as (typeof RADIUS_OPTIONS)[number]) ? value : null;
  });
  const [nameFilter, setNameFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('distance');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  // Ô "Tìm sân trống" ở trang chủ truyền ngày/giờ qua URL.
  const [date, setDate] = useState(() => searchParams.get('date') ?? '');
  const [startTime, setStartTime] = useState(() => searchParams.get('from') ?? '');
  const [endTime, setEndTime] = useState(() => searchParams.get('to') ?? '');
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
        ...(viewMode === 'map' && radiusKm !== null ? { radiusKm } : {}),
        ...(minPrice ? { minPrice: Number(minPrice) } : {}),
        ...(maxPrice ? { maxPrice: Number(maxPrice) } : {}),
        ...(sortOrder !== 'name' ? { sortBy: sortOrder } : {}),
        ...(parsedDate && startMinute !== null && endMinute !== null ? { date: parsedDate, startMinute, endMinute } : {}),
      });
      if (requestId === searchRequestId.current) setVenues(result);
    } catch {
      if (requestId === searchRequestId.current) {
        setVenues([]);
        setLoadError(errorMessage());
      }
    } finally {
      if (requestId === searchRequestId.current) setLoading(false);
    }
  }, [date, endTime, origin.lat, origin.lng, maxPrice, minPrice, radiusKm, sortOrder, startTime, viewMode]);

  useEffect(() => {
    void runSearch(false);
  }, [runSearch]);

  useEffect(() => {
    if (embedded || picking) return;
    const nextParams = new URLSearchParams({
      lat: String(origin.lat),
      lng: String(origin.lng),
    });
    if (radiusKm !== null) nextParams.set('radiusKm', String(radiusKm));
    setSearchParams(nextParams, { replace: true });
  }, [embedded, picking, origin.lat, origin.lng, radiusKm, setSearchParams]);

  const useMyLocation = useCallback(() => {
    setLocating(true); setLocateError('');
    // `gpsWon` chốt ngay khi GPS thành công (đồng bộ) để IP fallback đang chạy dở
    // không ghi đè; `settled` chặn nhiều nhánh cùng kết thúc.
    let gpsWon = false;
    let settled = false;
    const finish = () => { if (!settled) { settled = true; setLocating(false); } };
    // Fallback định vị theo IP khi Geolocation trình duyệt bị chặn/treo (máy bàn
    // không có nguồn định vị wifi, hoặc user chặn quyền). Cho vị trí thật ở mức
    // thành phố/quận thay vì đứng ở điểm mặc định. `hint` = thông báo hiển thị
    // nếu IP cũng thất bại.
    const applyIpFallback = (hint: string) => {
      void ipLocate().then((place) => {
        if (gpsWon || settled) return; // GPS đã thắng trong lúc chờ IP → bỏ qua
        if (place) {
          const nextLocation = { label: `${place.label} (gần đúng theo IP)`, lat: place.lat, lng: place.lng };
          setCurrentLocation(nextLocation);
          saveCurrentLocation(nextLocation);
          setSelectedLocation(null);
          setOrigin(nextLocation);
          setLocateError('Không lấy được GPS chính xác nên đang dùng vị trí gần đúng theo IP. Bấm trên bản đồ nếu muốn chỉnh lại điểm.');
        } else {
          setLocateError(hint);
        }
        finish();
      });
    };
    if (!('geolocation' in navigator)) { applyIpFallback('Trình duyệt không hỗ trợ định vị.'); return; }
    // Safety net: một số trình duyệt (Edge/Chrome trên máy bàn) treo hẳn, không
    // gọi callback nào đúng hạn → sau 12s tự chuyển sang fallback IP.
    const safety = window.setTimeout(() => {
      if (!gpsWon && !settled) applyIpFallback('Không nhận được vị trí. Hãy bấm trên bản đồ để chọn điểm.');
    }, 12000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        gpsWon = true;
        window.clearTimeout(safety);
        const { latitude, longitude } = position.coords;
        const nextLocation = { label: coordinateLabel(latitude, longitude), lat: latitude, lng: longitude };
        setCurrentLocation(nextLocation);
        saveCurrentLocation(nextLocation);
        setSelectedLocation(null);
        setOrigin(nextLocation);
        setLocateError(''); // xoá mọi thông báo IP fallback có thể đã hiện khi GPS chậm
        settled = true; setLocating(false);
        void reverseGeocode(latitude, longitude).then((addr) => {
          if (!addr) return;
          const resolvedLocation = { ...nextLocation, label: addr };
          setCurrentLocation((current) => (current?.lat === latitude && current.lng === longitude ? resolvedLocation : current));
          setOrigin((current) => (current.lat === latitude && current.lng === longitude ? resolvedLocation : current));
          saveCurrentLocation(resolvedLocation);
        });
      },
      () => {
        // Một số trình duyệt báo POSITION_UNAVAILABLE tạm thời trước khi nguồn GPS
        // hoàn tất. Giữ safety timer thay vì chạy IP ngay, để GPS còn cơ hội trả
        // vị trí chính xác; chỉ sau 12s không có GPS mới fallback sang IP.
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    useMyLocation();
  }, [useMyLocation]);

  const pickOriginOnMap = (lat: number, lng: number) => {
    const nextLocation = { label: 'Điểm đã chọn trên bản đồ', lat, lng };
    setSelectedLocation(nextLocation);
    setOrigin(nextLocation);
    setLocateError('');
    void reverseGeocode(lat, lng).then((addr) => {
      if (!addr) return;
      setSelectedLocation((current) => (current?.lat === lat && current.lng === lng ? { ...current, label: addr } : current));
      setOrigin((current) => (current.lat === lat && current.lng === lng ? { ...current, label: addr } : current));
    });
  };

  const returnToCurrentLocation = () => {
    if (!currentLocation) return;
    setSelectedLocation(null);
    setOrigin(currentLocation);
    setLocateError('');
  };

  const clearFilters = () => {
    setOrigin(DEFAULT_ORIGIN);
    setSelectedLocation(null);
    setLocateError('');
    setRadiusKm(null);
    setNameFilter('');
    setSortOrder('distance');
    setMinPrice('');
    setMaxPrice('');
    setDate('');
    setStartTime('');
    setEndTime('');
  };

  const visibleVenues = useMemo(() => {
    const normalizedFilter = nameFilter.trim().toLocaleLowerCase('vi-VN');
    const filtered = normalizedFilter.length === 0
      ? venues
      : venues.filter((venue) => [venue.name, venue.businessCode]
        .some((value) => value?.toLocaleLowerCase('vi-VN').includes(normalizedFilter)));
    return [...filtered].sort((left, right) => (
      sortOrder === 'distance'
        ? left.distanceKm - right.distanceKm
        : sortOrder === 'price'
          ? Number(left.lowestPrice ?? Number.MAX_SAFE_INTEGER) - Number(right.lowestPrice ?? Number.MAX_SAFE_INTEGER)
          : left.name.localeCompare(right.name, 'vi')
    ));
  }, [nameFilter, sortOrder, venues]);

  // Đổi bộ lọc → quay về trang 1.
  useEffect(() => { setPage(1); }, [visibleVenues]);

  const pageCount = Math.max(1, Math.ceil(visibleVenues.length / PAGE_SIZE));
  const pagedVenues = picking ? visibleVenues.slice(0, pickLimit) : visibleVenues.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const priceLabel = minPrice || maxPrice ? `${minPrice ? shortMoney(minPrice) : '0'} – ${maxPrice ? shortMoney(maxPrice) : '∞'}` : 'Mọi mức';
  const mapPoints = visibleVenues.map((venue) => ({ venueId: venue.venueId, name: venue.name, address: venue.address, lat: venue.lat, lng: venue.lng, distanceKm: venue.distanceKm, lowestPrice: venue.lowestPrice, coverImage: venue.coverImage, courtCount: venue.courtCount }));

  const cardFor = (venue: VenueSearchRow) => onSelectVenue
    ? <button key={venue.venueId} type="button" onClick={() => onSelectVenue(venue)} className="block h-full rounded-2xl text-left"><VenueCard venue={venue} compact /></button>
    : <Link key={venue.venueId} to={`/venues/${encodeURIComponent(venue.venueId)}`} className="block h-full rounded-2xl"><VenueCard venue={venue} /></Link>;

  // Trang chủ: bản đồ (giữ popup thẻ sân) + 4 sân gần nhất, không bộ lọc.
  if (embedded) {
    return (
      <section className="page-container py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="courtin-kicker">Đặt sân quanh bạn</p>
            <h2 className="mt-1 text-h2">Sân gần bạn</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500"><Icon name="pin" className="h-4 w-4" /><span>{origin.label}</span></p>
          </div>
          <Link to="/venues" className="inline-flex items-center gap-1.5 font-bold text-brand-navy hover:underline">Xem tất cả{!loading && !loadError ? ` ${visibleVenues.length}` : ''} sân<Icon name="arrowRight" className="h-4 w-4" /></Link>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[5fr_7fr]">
          <VenuesMap className="!h-[34rem]" searchOrigin={{ lat: origin.lat, lng: origin.lng }} currentLocation={currentLocation} venues={mapPoints} onPickOrigin={pickOriginOnMap} onReturnCurrent={returnToCurrentLocation} />
          {loadError ? <RouteState variant="error" title="Chưa tải được danh sách sân" description={loadError} onRetry={() => void runSearch(true)} />
            : loading ? <div className="grid gap-5 sm:grid-cols-2">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-64 !rounded-2xl" />)}</div>
            : visibleVenues.length === 0 ? <EmptyState title="Chưa có sân gần đây" description="Bấm vào bản đồ để tìm quanh điểm khác." />
            : <div className="grid gap-5 sm:grid-cols-2">{visibleVenues.slice(0, 4).map(cardFor)}</div>}
        </div>
      </section>
    );
  }

  const Wrapper = picking ? 'section' : 'main';
  return (
    <Wrapper className={picking ? '' : 'min-h-screen bg-canvas pb-16 pt-8 sm:pt-10'}>
      <div className={picking ? '' : 'page-container'}>
        {!picking && <PageHeader eyebrow="Đặt sân cầu lông" title="Sân cầu lông gần bạn" description="Lọc theo ngày, giờ, bán kính và giá để tìm sân còn trống." />}

        <form className={`surface-card p-4 sm:p-5 ${picking ? '' : 'mt-6'}`} onSubmit={(event) => { event.preventDefault(); setPriceOpen(false); void runSearch(true); }}>
          <div className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1.3fr_.9fr_1fr_auto]">
            <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Tên sân
              <span className="relative"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" /><TextInput id="venue-name" list="venue-name-suggestions" autoComplete="off" value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} placeholder="Tên hoặc mã cơ sở" className="pl-10" /></span>
              <datalist id="venue-name-suggestions">{venues.map((venue) => <option key={venue.venueId} value={venue.name}>{venue.address}</option>)}</datalist>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Ngày chơi<TextInput id="venue-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <div className="grid gap-1.5 text-sm font-semibold text-ink-700"><span>Khung giờ</span><div className="grid grid-cols-2 gap-2"><TextInput aria-label="Giờ bắt đầu" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /><TextInput aria-label="Giờ kết thúc" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></div></div>
            <label htmlFor="venue-radius" className="grid gap-1.5 text-sm font-semibold text-ink-700">Bán kính
              <SelectInput id="venue-radius" value={radiusKm ?? ''} onChange={(event) => setRadiusKm(event.target.value ? Number(event.target.value) : null)}>
                <option value="">Không giới hạn</option>
                {RADIUS_OPTIONS.map((option) => <option key={option} value={option}>{option} km</option>)}
              </SelectInput>
            </label>
            <div className="relative grid gap-1.5 text-sm font-semibold text-ink-700">
              <span>Giá / giờ</span>
              <button type="button" aria-expanded={priceOpen} onClick={() => setPriceOpen((open) => !open)} className="flex min-h-[46px] items-center justify-between rounded-[var(--radius-control)] border border-line bg-surface px-3 font-semibold text-ink-900"><span className={minPrice || maxPrice ? 'text-figures' : ''}>{priceLabel}</span><Icon name="chevronDown" className={`h-4 w-4 transition ${priceOpen ? 'rotate-180' : ''}`} /></button>
              {priceOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-2xl border border-line bg-surface p-5 font-normal shadow-[var(--shadow-raised)]">
                  <div className="relative h-8">
                    <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" aria-hidden="true" />
                    <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-navy" style={{ left: `${(Math.min(PRICE_MAX, Number(minPrice) || PRICE_MIN) / PRICE_MAX) * 100}%`, right: `${100 - (Math.min(PRICE_MAX, Number(maxPrice) || PRICE_MAX) / PRICE_MAX) * 100}%` }} aria-hidden="true" />
                    <input type="range" aria-label="Giá tối thiểu" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={Number(minPrice) || PRICE_MIN} onChange={(event) => setMinPrice(String(Math.min(Number(event.target.value), Number(maxPrice) || PRICE_MAX)))} className={rangeClass} />
                    <input type="range" aria-label="Giá tối đa" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={Number(maxPrice) || PRICE_MAX} onChange={(event) => setMaxPrice(String(Math.max(Number(event.target.value), Number(minPrice) || PRICE_MIN)))} className={rangeClass} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <TextInput aria-label="Giá tối thiểu (nhập tay)" inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ''))} placeholder="0" />
                    <TextInput aria-label="Giá tối đa (nhập tay)" inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ''))} placeholder={String(PRICE_MAX)} />
                  </div>
                  <div className="mt-4 flex justify-between"><Button tone="ghost" size="sm" onClick={() => { setMinPrice(''); setMaxPrice(''); }}>Đặt lại</Button><Button size="sm" onClick={() => setPriceOpen(false)}>Xong</Button></div>
                </div>
              )}
            </div>
            <Button type="submit" disabled={loading} className="md:col-span-2 xl:col-span-1"><Icon name="search" className="h-4 w-4" />Tìm sân</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 font-semibold text-brand-navy"><Icon name="pin" className="h-4 w-4" /><span className="truncate" title={origin.label}>{origin.label}</span></span>
              <Button type="button" tone="ghost" size="sm" onClick={useMyLocation} disabled={locating}>{locating ? 'Đang định vị…' : 'Dùng vị trí của tôi'}</Button>
              {locateError && <span className="text-xs text-danger">{locateError}</span>}
            </div>
            <Button type="button" tone="ghost" size="sm" onClick={clearFilters}>Xóa bộ lọc</Button>
          </div>
        </form>

        <div className="mb-5 mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
            {!loading && !loadError && <><span className="text-figures font-semibold text-ink-900">{visibleVenues.length}</span> sân ·</>}
            <label htmlFor="venue-sort">Sắp xếp</label>
            <select id="venue-sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} className="cursor-pointer rounded-lg bg-transparent font-bold text-brand-navy">
              <option value="distance">Gần nhất</option>
              <option value="price">Giá thấp nhất</option>
              <option value="name">Tên sân</option>
            </select>
          </p>
          <div className="inline-flex rounded-full border border-line bg-canvas p-1" role="tablist" aria-label="Chế độ hiển thị">{([['list', 'Danh sách'], ['map', 'Bản đồ']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={viewMode === value} onClick={() => setViewMode(value)} className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${viewMode === value ? 'bg-brand-navy text-surface' : 'text-ink-500 hover:text-brand-navy'}`}>{label}</button>)}</div>
        </div>

        {viewMode === 'map' && <VenuesMap className="mb-6 !h-[32rem]" searchOrigin={{ lat: origin.lat, lng: origin.lng }} currentLocation={currentLocation} venues={mapPoints} onPickOrigin={pickOriginOnMap} onReturnCurrent={returnToCurrentLocation} onSelectVenue={onSelectVenue && ((venueId) => { const venue = visibleVenues.find((item) => item.venueId === venueId); if (venue) onSelectVenue(venue); })} />}

        {loadError ? <RouteState variant="error" title="Chưa tải được danh sách sân" description={loadError} onRetry={() => void runSearch(true)} />
          : loading ? <div className={`grid gap-5 sm:grid-cols-2 ${picking ? 'xl:grid-cols-3' : 'lg:grid-cols-3'}`}>{[0, 1, 2].map((key) => <Skeleton key={key} className="h-72 !rounded-2xl" />)}</div>
          : visibleVenues.length === 0 ? <EmptyState title={nameFilter.trim() ? 'Không tìm thấy sân theo tên này' : 'Không có sân phù hợp'} description={nameFilter.trim() ? 'Thử bỏ bớt từ khóa.' : radiusKm !== null ? `Không có sân trong ${radiusKm} km. Thử tăng bán kính.` : 'Thử xóa bớt bộ lọc.'} />
          : <div className={`grid gap-5 sm:grid-cols-2 ${picking ? 'xl:grid-cols-3' : 'lg:grid-cols-3'}`}>{pagedVenues.map(cardFor)}</div>}

        {picking && !loading && visibleVenues.length > pickLimit && (
          <div className="mt-4 flex justify-center"><Button type="button" tone="secondary" onClick={() => setPickLimit((current) => current + PICK_PAGE)}>Xem thêm ({visibleVenues.length - pickLimit} cơ sở)</Button></div>
        )}
        {!picking && !loading && pageCount > 1 && <div className="mt-8"><Pagination page={page} pageCount={pageCount} onChange={(next) => { setPage(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }} /></div>}
      </div>
    </Wrapper>
  );
}

const rangeClass = 'pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand-navy [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-navy';

function shortMoney(value: string) {
  const amount = Number(value);
  return amount >= 1000 ? `${Math.round(amount / 1000)}k` : String(amount);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((word) => word[0]).join('').toUpperCase();
}

/** Thẻ sân dùng chung (danh sách, trang chủ, chọn cơ sở). Ảnh lỗi/không có → khung chữ viết tắt. */
export function VenueCard({ venue, compact = false }: { venue: VenueSearchRow; compact?: boolean }) {
  const [broken, setBroken] = useState(false);
  const lowestPrice = formatLowestPrice(venue.lowestPrice);
  return (
    <article className="surface-card flex h-full flex-col overflow-hidden transition duration-150 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]">
      {!compact && (
        <div className="aspect-[16/10] w-full overflow-hidden bg-green-50">
          {venue.coverImage && !broken
            ? <img src={venue.coverImage} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
            : <div className="grid h-full place-items-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-surface font-display text-2xl font-extrabold text-brand-navy">{initials(venue.name)}</span></div>}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-bold text-ink-900">{venue.name}</h3>
        <p className="line-clamp-1 text-sm text-ink-500" title={venue.address}>{venue.address}</p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3 text-sm">
          <span className="flex items-center gap-1 text-ink-500"><Icon name="pin" className="h-4 w-4" /><span className="text-figures">{venue.distanceKm.toFixed(1)} km</span> · {venue.courtCount} sân</span>
          {lowestPrice && <span>từ <b className="text-figures font-semibold text-brand-navy">{lowestPrice}</b>/giờ</span>}
        </div>
      </div>
    </article>
  );
}
