import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, Skeleton, SurfaceCard } from '../components/ui';
import { getVenueDetail, type VenueDetail } from '../lib/venueBookingApi';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể tải thông tin cơ sở. Hãy thử lại.';
}

function isNotFound(message: string): boolean {
  return /404|not found|không tìm thấy/i.test(message);
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function BookVenueButton({ venueId, className = '' }: { venueId: string; className?: string }) {
  return <Link to={`/booking?venueId=${encodeURIComponent(venueId)}`} className={`inline-flex items-center justify-center rounded-full bg-green-600 px-6 py-3 text-sm font-semibold text-surface transition duration-150 hover:-translate-y-px hover:bg-green-700 ${className}`}>Đặt sân</Link>;
}

function VenueDetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" aria-live="polite">
      <div className="space-y-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <SurfaceCard className="space-y-4"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-16 w-full" /></SurfaceCard>
      </div>
      <SurfaceCard className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-5 w-2/3" /></SurfaceCard>
    </div>
  );
}

export function VenueDetailPage() {
  const { id: venueId } = useParams<{ id: string }>();
  const [venue, setVenue] = useState<VenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    if (!venueId) {
      setVenue(null);
      setLoadError('Không tìm thấy cơ sở.');
      setLoading(false);
      return () => { active = false; };
    }

    const loadVenue = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await getVenueDetail(venueId);
        if (active) setVenue(result);
      } catch (error) {
        if (active) {
          setVenue(null);
          setLoadError(errorMessage(error));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadVenue();
    return () => { active = false; };
  }, [reloadKey, venueId]);

  const retry = () => setReloadKey((value) => value + 1);

  if (loading) {
    return <main className="min-h-screen bg-canvas py-8 sm:py-10"><div className="page-container"><VenueDetailSkeleton /></div></main>;
  }

  if (loadError !== null && isNotFound(loadError)) {
    return (
      <main className="min-h-screen bg-canvas py-8 sm:py-10"><div className="page-container">
        <EmptyState title="Không tìm thấy cơ sở" description="Cơ sở này có thể đã được gỡ hoặc đường dẫn không còn hợp lệ." action={<Link to="/venues" className="inline-flex rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-surface">Xem danh sách sân</Link>} />
      </div></main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-canvas py-8 sm:py-10"><div className="page-container">
        <SurfaceCard><p role="alert" className="text-sm text-danger">{loadError}</p><Button tone="secondary" className="mt-4" onClick={retry}>Thử lại</Button></SurfaceCard>
      </div></main>
    );
  }

  if (!venue) {
    return <main className="min-h-screen bg-canvas py-8 sm:py-10"><div className="page-container"><EmptyState title="Không tìm thấy cơ sở" description="Cơ sở này không còn khả dụng." action={<Link to="/venues" className="inline-flex rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-surface">Xem danh sách sân</Link>} /></div></main>;
  }

  const hasCourts = venue.courts.length > 0;
  const images = textList(venue.images);
  const amenities = textList(venue.amenities);
  const mapQuery = Number.isFinite(venue.lat) && Number.isFinite(venue.lng) ? `${venue.lat},${venue.lng}` : venue.address;
  const mapUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : null;

  return (
    <main className="min-h-screen bg-canvas pb-24 pt-8 sm:pb-12 sm:pt-10">
      <div className="page-container">
        <nav aria-label="Điều hướng" className="mb-6 text-sm text-ink-500"><Link to="/venues" className="hover:text-green-700">Sân</Link><span aria-hidden> › </span><span className="text-ink-700">{venue.name}</span></nav>
        <div className="mb-8 border-b border-line pb-6">
          <p className="text-caption text-green-700">Cơ sở cầu lông</p>
          <h1 className="mt-2 text-h1">{venue.name}</h1>
          {venue.address && <p className="mt-2 text-body text-ink-500">{venue.address}</p>}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="space-y-6">
            {images.length > 0 && <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2" aria-label="Ảnh cơ sở">{images.map((src, index) => <img key={src} src={src} alt={`${venue.name} ${index + 1}`} className="aspect-video w-[min(100%,36rem)] shrink-0 snap-start rounded-2xl object-cover" />)}</div>}
            <SurfaceCard>
              <h2 className="text-h2">Sân con</h2>
              {hasCourts ? (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {venue.courts.map((court) => <li key={court.id} className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm font-medium text-ink-700">{court.name}</li>)}
                </ul>
              ) : <p className="mt-3 text-sm text-ink-500">Sân đang cập nhật lịch.</p>}
            </SurfaceCard>
            {amenities.length > 0 && <SurfaceCard><h2 className="text-h2">Tiện ích</h2><ul className="mt-4 grid gap-2 sm:grid-cols-2">{amenities.map((amenity) => <li key={amenity} className="text-sm text-ink-700"><span aria-hidden className="mr-2 text-green-700">✓</span>{amenity}</li>)}</ul></SurfaceCard>}
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-24">
            <SurfaceCard>
              <h2 className="text-h3">Đặt sân tại đây</h2>
              <p className="mt-2 text-sm text-ink-500">Chọn sân con và khung giờ ở bước tiếp theo.</p>
              {hasCourts ? <BookVenueButton venueId={venue.id} className="mt-5 w-full" /> : <Button disabled className="mt-5 w-full">Sân đang cập nhật</Button>}
            </SurfaceCard>
            {mapUrl && <SurfaceCard className="mt-4"><h2 className="text-h3">Vị trí</h2><p className="mt-2 text-sm text-ink-500">{venue.address}</p><a href={mapUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-semibold text-green-700 hover:underline">Mở chỉ đường</a></SurfaceCard>}
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden">
        <div className="page-container">{hasCourts ? <BookVenueButton venueId={venue.id} className="w-full" /> : <Button disabled className="w-full">Sân đang cập nhật</Button>}</div>
      </div>
    </main>
  );
}
