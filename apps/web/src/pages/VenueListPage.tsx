import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, EmptyState, SelectInput, Skeleton, SurfaceCard, TextInput } from '../components/ui';
import { searchVenues, type VenueSearchRow } from '../lib/venueBookingApi';

type LocationChoice = { id: string; label: string; lat: number; lng: number };
type SortOrder = 'nearest' | 'name';

const CITY_CHOICES: readonly LocationChoice[] = [
  { id: 'ho-chi-minh', label: 'Thành phố Hồ Chí Minh', lat: 10.8231, lng: 106.6297 },
  { id: 'ha-noi', label: 'Hà Nội', lat: 21.0285, lng: 105.8542 },
  { id: 'da-nang', label: 'Đà Nẵng', lat: 16.0544, lng: 108.2022 },
];

const RADIUS_OPTIONS = [5, 10, 20] as const;
const currencyFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

function readCoordinate(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function initialLocation(searchParams: URLSearchParams): LocationChoice {
  const lat = readCoordinate(searchParams.get('lat'));
  const lng = readCoordinate(searchParams.get('lng'));
  if (lat !== null && lng !== null) {
    const matchingCity = CITY_CHOICES.find((city) => city.lat === lat && city.lng === lng);
    return matchingCity ?? { id: 'linked-location', label: 'Vị trí trên liên kết', lat, lng };
  }
  return CITY_CHOICES[0];
}

function formatLowestPrice(price: string | null): string | null {
  if (price === null) return null;
  const value = Number(price);
  return Number.isFinite(value) ? currencyFormatter.format(value) : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể tải danh sách sân. Hãy thử lại.';
}

export function VenueListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [location, setLocation] = useState<LocationChoice>(() => initialLocation(searchParams));
  const [radiusKm, setRadiusKm] = useState<number>(() => {
    const value = Number(searchParams.get('radiusKm'));
    return RADIUS_OPTIONS.includes(value as (typeof RADIUS_OPTIONS)[number]) ? value : 10;
  });
  const [nameFilter, setNameFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('nearest');
  const [venues, setVenues] = useState<VenueSearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const searchRequestId = useRef(0);

  const runSearch = useCallback(async () => {
    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await searchVenues({ lat: location.lat, lng: location.lng, radiusKm });
      if (requestId === searchRequestId.current) setVenues(result);
    } catch (error) {
      if (requestId === searchRequestId.current) {
        setVenues([]);
        setLoadError(errorMessage(error));
      }
    } finally {
      if (requestId === searchRequestId.current) setLoading(false);
    }
  }, [location.lat, location.lng, radiusKm]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  useEffect(() => {
    const nextParams = new URLSearchParams({
      lat: String(location.lat),
      lng: String(location.lng),
      radiusKm: String(radiusKm),
    });
    setSearchParams(nextParams, { replace: true });
  }, [location.lat, location.lng, radiusKm, setSearchParams]);

  const visibleVenues = useMemo(() => {
    const normalizedFilter = nameFilter.trim().toLocaleLowerCase('vi-VN');
    const filtered = normalizedFilter.length === 0
      ? venues
      : venues.filter((venue) => venue.name.toLocaleLowerCase('vi-VN').includes(normalizedFilter));
    return [...filtered].sort((left, right) => (
      sortOrder === 'nearest'
        ? left.distanceKm - right.distanceKm
        : left.name.localeCompare(right.name, 'vi')
    ));
  }, [nameFilter, sortOrder, venues]);

  const selectLocation = (id: string) => {
    const nextLocation = CITY_CHOICES.find((city) => city.id === id);
    if (nextLocation) setLocation(nextLocation);
  };

  return (
    <main className="min-h-screen bg-canvas pb-12 pt-8 sm:pt-10">
      <div className="page-container">
        <form
          className="surface-card sticky top-[76px] z-10 mb-8 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.05fr_1.6fr_.65fr_.65fr_auto]"
          onSubmit={(event) => { event.preventDefault(); void runSearch(); }}
        >
          <div>
            <label htmlFor="venue-city" className="mb-1.5 block text-caption">Khu vực</label>
            <SelectInput id="venue-city" value={location.id} onChange={(event) => selectLocation(event.target.value)}>
              {location.id === 'linked-location' && <option value="linked-location">Vị trí trên liên kết</option>}
              {CITY_CHOICES.map((city) => <option key={city.id} value={city.id}>{city.label}</option>)}
            </SelectInput>
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
              <option value="nearest">Gần nhất</option>
              <option value="name">Tên sân</option>
            </SelectInput>
          </div>
          <Button type="submit" className="self-end" disabled={loading}>Tìm sân</Button>
        </form>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-caption text-green-700">Đặt sân cầu lông</p>
            <h1 className="mt-1 text-h1">Sân cầu lông tại {location.label}</h1>
          </div>
          {!loading && !loadError && <p className="text-sm text-ink-500"><span className="text-figures text-ink-900">{visibleVenues.length}</span> sân</p>}
        </div>

        {loadError && (
          <SurfaceCard className="border-danger-bg" aria-live="polite">
            <p role="alert" className="text-sm text-danger">{loadError}</p>
            <Button className="mt-4" tone="secondary" onClick={() => void runSearch()}>Thử lại</Button>
          </SurfaceCard>
        )}

        {loading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
            {Array.from({ length: 6 }, (_, index) => (
              <SurfaceCard key={index} className="space-y-4" aria-label="Đang tải sân">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </SurfaceCard>
            ))}
          </div>
        )}

        {!loading && !loadError && visibleVenues.length === 0 && (
          <EmptyState
            title={nameFilter.trim() ? 'Không tìm thấy sân theo tên này' : 'Không có sân trong bán kính này'}
            description={nameFilter.trim() ? 'Thử bỏ bớt từ khóa hoặc chọn khu vực khác.' : 'Hãy thử mở rộng bán kính tìm kiếm.'}
            action={radiusKm < 20 ? <Button tone="secondary" onClick={() => setRadiusKm(20)}>Mở rộng lên 20 km</Button> : undefined}
          />
        )}

        {!loading && !loadError && visibleVenues.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleVenues.map((venue) => {
              const lowestPrice = formatLowestPrice(venue.lowestPrice);
              return (
                <Link key={venue.venueId} to={`/venues/${encodeURIComponent(venue.venueId)}`} className="block rounded-2xl focus-visible:outline-none">
                  <SurfaceCard hoverable className="h-full">
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between gap-2"><p className="text-caption text-green-700">Sân cầu lông</p><Badge tone="success">Đặt được</Badge></div>
                      <h2 className="mt-2 text-h3 text-ink-900">{venue.name}</h2>
                      <p className="mt-2 text-sm leading-6 text-ink-500">{venue.address}</p>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-sm">
                        <span className="text-figures text-ink-700">~{venue.distanceKm.toFixed(1)} km</span>
                        {lowestPrice && <span className="text-figures font-medium text-green-700">Từ {lowestPrice}</span>}
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
