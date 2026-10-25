import { BusinessCode } from '../components/BusinessCode.js';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Modal, SurfaceCard } from '../components/ui';
import { Icon } from '../components/Icon';
import { RouteState } from '../components/RouteState.js';
import { getVenueDetail, type VenueDetail } from '../lib/venueBookingApi';
import { LocationMap } from '../components/map/LocationMap';
import { useLiveDataRefresh } from '../realtime/dataInvalidation.js';

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
  return <Link to={`/booking?venueId=${encodeURIComponent(venueId)}`} className={`inline-flex min-h-[52px] items-center justify-center rounded-full bg-brand-yellow px-6 py-3 text-sm font-bold uppercase tracking-[.04em] text-brand-navy transition duration-150 hover:-translate-y-px hover:bg-brand-yellow-hover ${className}`}>Đặt sân</Link>;
}

export function VenueDetailPage() {
  const { id: venueId } = useParams<{ id: string }>();
  const [venue, setVenue] = useState<VenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);

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
  useLiveDataRefresh(retry);

  if (loading) {
    return <main className="min-h-screen bg-canvas py-8 sm:py-10"><div className="page-container"><RouteState variant="loading" title="Đang tải thông tin cơ sở" /></div></main>;
  }

  if ((loadError !== null && isNotFound(loadError)) || (!loadError && !venue)) {
    return <main className="min-h-screen bg-canvas py-8 sm:py-10"><div className="page-container"><RouteState variant="notFound" title="Không tìm thấy cơ sở" description="Cơ sở có thể đã được gỡ hoặc đường dẫn không đúng." action={<Link to="/venues" className="inline-flex min-h-11 items-center rounded-full bg-brand-yellow px-5 text-sm font-bold uppercase tracking-[0.035em] text-brand-navy">Xem danh sách sân</Link>} /></div></main>;
  }

  if (loadError || !venue) {
    return <main className="min-h-screen bg-canvas py-8 sm:py-10"><div className="page-container"><RouteState variant="error" title="Chưa tải được cơ sở" description="Máy chủ đang bận hoặc kết nối bị gián đoạn. Hãy thử lại." onRetry={retry} /></div></main>;
  }

  const hasCourts = venue.courts.length > 0;
  const images = textList(venue.images);
  const amenities = textList(venue.amenities);
  const hasCoords = Number.isFinite(venue.lat) && Number.isFinite(venue.lng);
  const mapQuery = hasCoords ? `${venue.lat},${venue.lng}` : venue.address;
  const mapUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : null;
  const shown = images.slice(0, 5);

  return (
    <main className="min-h-screen bg-canvas pb-24 pt-8 sm:pb-16 sm:pt-10">
      <div className="page-container">
        <nav aria-label="Điều hướng" className="flex items-center gap-1.5 text-sm text-ink-500"><Link to="/venues" className="font-semibold text-brand-navy hover:underline">Đặt sân</Link><Icon name="chevronRight" className="h-4 w-4" /><span className="text-ink-700">{venue.name}</span></nav>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-h1">{venue.name}</h1>
            {venue.address && <p className="mt-2 flex items-center gap-1.5 text-ink-500"><Icon name="pin" className="h-4 w-4" />{venue.address}</p>}
          </div>
          <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold text-ink-700 shadow-[var(--shadow-card)]">{venue.courts.length} sân</span>
        </div>

        {shown.length > 0 && (
          <div className={`relative mt-6 grid gap-2.5 overflow-hidden rounded-[1.25rem] ${shown.length === 1 ? '' : 'grid-cols-4 grid-rows-2'}`} style={{ height: shown.length === 1 ? '26rem' : '28rem' }}>
            {shown.map((src, index) => (
              <button key={src} type="button" onClick={() => setGalleryOpen(true)} aria-label={`Xem ảnh ${index + 1}`} className={`overflow-hidden bg-green-50 ${shown.length > 1 && index === 0 ? 'col-span-2 row-span-2' : ''} ${shown.length === 2 ? 'col-span-2 row-span-2' : ''} ${shown.length === 3 && index > 0 ? 'col-span-2' : ''} ${shown.length === 4 && index === 3 ? 'col-span-2' : ''}`}>
                <img src={src} alt="" className="h-full w-full object-cover transition hover:scale-[1.02]" />
              </button>
            ))}
            {images.length > 1 && <button type="button" onClick={() => setGalleryOpen(true)} className="absolute bottom-4 right-4 inline-flex min-h-9 items-center gap-2 rounded-full bg-surface px-4 text-xs font-bold uppercase tracking-[0.035em] text-brand-navy shadow-[var(--shadow-raised)]"><Icon name="grid" className="h-4 w-4" />Xem tất cả {images.length} ảnh</button>}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-6">
            <SurfaceCard className="!p-6">
              <h2 className="text-h3">Sân con</h2>
              {hasCourts ? (
                <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                  {venue.courts.map((court) => <li key={court.id} className="rounded-xl border border-line bg-canvas px-4 py-3 font-semibold text-ink-900">{court.name}</li>)}
                </ul>
              ) : <p className="mt-3 text-sm text-ink-500">Sân đang cập nhật lịch.</p>}
            </SurfaceCard>
            {amenities.length > 0 && <SurfaceCard className="!p-6"><h2 className="text-h3">Tiện ích</h2><ul className="mt-4 grid gap-3 sm:grid-cols-3">{amenities.map((amenity) => <li key={amenity} className="flex items-center gap-2.5 rounded-xl bg-canvas px-4 py-3 text-sm font-semibold text-ink-700"><Icon name="check" className="h-4 w-4 text-success" />{amenity}</li>)}</ul></SurfaceCard>}
            <SurfaceCard className="!p-6">
              <div className="flex items-center justify-between gap-3"><h2 className="text-h3">Vị trí</h2>{mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line px-4 text-xs font-bold uppercase tracking-[0.035em] text-brand-navy hover:border-brand-navy"><Icon name="navigation" className="h-4 w-4" />Chỉ đường</a>}</div>
              {hasCoords && <LocationMap lat={venue.lat} lng={venue.lng} label={venue.name} className="mt-4" />}
            </SurfaceCard>
            <SurfaceCard className="!p-6">
              <h2 className="text-h3">Giữ chỗ &amp; hủy sân</h2>
              <div className="mt-4 grid overflow-hidden rounded-xl border border-line sm:grid-cols-3">
                {([['100%', 'Hủy từ 24 giờ trước', 'text-success'], ['50%', 'Hủy từ 6 đến dưới 24 giờ', 'text-warning'], ['0%', 'Hủy dưới 6 giờ', 'text-danger']] as const).map(([rate, when, tone]) => <div key={rate} className="border-line p-4 sm:border-l sm:first:border-l-0"><p className={`text-figures text-2xl font-semibold ${tone}`}>{rate}</p><p className="text-sm text-ink-500">{when}</p></div>)}
              </div>
            </SurfaceCard>
            <BusinessCode code={venue.businessCode} label="Mã cơ sở" />
          </div>

          <aside className="hidden lg:sticky lg:top-24 lg:block">
            <SurfaceCard className="!p-6 shadow-[var(--shadow-raised)]">
              <h2 className="text-h3">Đặt sân tại đây</h2>
              <p className="mt-1 text-sm text-ink-500">Chọn sân con và khung giờ ở bước tiếp theo.</p>
              {hasCourts ? <BookVenueButton venueId={venue.id} className="mt-5 w-full" /> : <Button disabled className="mt-5 w-full">Sân đang cập nhật</Button>}
              <ul className="mt-5 grid gap-2.5 text-sm text-ink-700">
                {['Giữ chỗ 10 phút, chưa trừ tiền', 'Thanh toán VietQR hoặc số dư ví', 'Hoàn 100% nếu hủy trước 24 giờ'].map((line) => <li key={line} className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-success" />{line}</li>)}
              </ul>
            </SurfaceCard>
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden">
        <div className="page-container">{hasCourts ? <BookVenueButton venueId={venue.id} className="w-full" /> : <Button disabled className="w-full">Sân đang cập nhật</Button>}</div>
      </div>

      <Modal open={galleryOpen} title={`Ảnh ${venue.name}`} onClose={() => setGalleryOpen(false)}>
        <div className="grid gap-3">{images.map((src, index) => <img key={src} src={src} alt={`${venue.name} ${index + 1}`} className="w-full rounded-xl object-cover" />)}</div>
      </Modal>
    </main>
  );
}
