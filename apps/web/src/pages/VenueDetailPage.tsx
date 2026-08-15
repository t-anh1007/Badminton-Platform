import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, SurfaceCard } from '../components/ui';
import { RouteState } from '../components/RouteState.js';
import { PageHeader } from '../components/courtin/PageHeader';
import { getVenueDetail, type VenueDetail } from '../lib/venueBookingApi';
import { LocationMap } from '../components/map/LocationMap';

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
  return <Link to={`/booking?venueId=${encodeURIComponent(venueId)}`} className={`inline-flex items-center justify-center rounded-full bg-brand-yellow px-6 py-3 text-sm font-bold uppercase tracking-[.04em] text-brand-navy transition duration-150 hover:-translate-y-px hover:bg-brand-yellow-hover ${className}`}>Đặt sân</Link>;
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
    return <main className="min-h-screen bg-canvas py-8 sm:py-10"><div className="page-container"><RouteState variant="loading" title="Đang tải thông tin cơ sở" /></div></main>;
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
        <RouteState variant="error" title="Không thể tải cơ sở" description={loadError} onRetry={retry} />
      </div></main>
    );
  }

  if (!venue) {
    return <main className="min-h-screen bg-canvas py-8 sm:py-10"><div className="page-container"><EmptyState title="Không tìm thấy cơ sở" description="Cơ sở này không còn khả dụng." action={<Link to="/venues" className="inline-flex rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-surface">Xem danh sách sân</Link>} /></div></main>;
  }

  const hasCourts = venue.courts.length > 0;
  const images = textList(venue.images);
  const amenities = textList(venue.amenities);
  const hasCoords = Number.isFinite(venue.lat) && Number.isFinite(venue.lng);
  const mapQuery = hasCoords ? `${venue.lat},${venue.lng}` : venue.address;
  const mapUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : null;

  return (
    <main className="min-h-screen bg-canvas pb-24 pt-8 sm:pb-12 sm:pt-10">
      <div className="page-container">
        <nav aria-label="Điều hướng" className="mb-6 text-sm text-ink-500"><Link to="/venues" className="hover:text-green-700">Sân</Link><span aria-hidden> › </span><span className="text-ink-700">{venue.name}</span></nav>
        <PageHeader eyebrow="Cơ sở cầu lông" title={venue.name} description={venue.address || undefined} />

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
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
            {amenities.length > 0 && <SurfaceCard><h2 className="text-h2">Tiện ích</h2><ul className="mt-4 grid gap-2 sm:grid-cols-2">{amenities.map((amenity) => <li key={amenity} className="text-sm text-ink-700"><span aria-hidden className="mr-2 text-brand-navy">✓</span>{amenity}</li>)}</ul></SurfaceCard>}
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-24">
            <SurfaceCard>
              <h2 className="text-h3">Đặt sân tại đây</h2>
              <p className="mt-2 text-sm text-ink-500">Chọn sân con và khung giờ ở bước tiếp theo.</p>
              {hasCourts ? <BookVenueButton venueId={venue.id} className="mt-5 w-full" /> : <Button disabled className="mt-5 w-full">Sân đang cập nhật</Button>}
            </SurfaceCard>
            <SurfaceCard className="mt-4"><h2 className="text-h3">Vị trí</h2><p className="mt-2 text-sm text-ink-500">{venue.address}</p>{hasCoords && <LocationMap lat={venue.lat} lng={venue.lng} label={venue.name} className="mt-3" />}{mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-semibold text-brand-navy hover:underline">Mở chỉ đường</a>}</SurfaceCard>
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden">
        <div className="page-container">{hasCourts ? <BookVenueButton venueId={venue.id} className="w-full" /> : <Button disabled className="w-full">Sân đang cập nhật</Button>}</div>
      </div>
    </main>
  );
}
