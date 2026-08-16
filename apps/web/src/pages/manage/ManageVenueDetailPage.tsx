import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, SurfaceCard, TextInput } from '../../components/ui';
import {
  addManagedCourt,
  deactivateManagedCourt,
  getMyManagedVenue,
  updateManagedVenue,
  authorizeVenueImage,
  uploadVenueImage,
  type ManagedVenue,
} from '../../lib/venueBookingApi';
import { ImageUploadPicker, type UploadImageState } from '../../components/CommunityComposer';
import { RouteState } from '../../components/RouteState.js';
import { LocationPicker } from '../../components/map/LocationPicker';

interface StoredImage { objectKey: string; url: string | null }

function normalizeImages(raw: unknown): StoredImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): StoredImage | null => {
      if (typeof item === 'string') {
        const isUrl = /^https?:\/\//i.test(item);
        return { objectKey: item, url: isUrl ? item : null };
      }
      if (item && typeof item === 'object' && 'objectKey' in item) {
        const key = String((item as { objectKey: unknown }).objectKey);
        if (!key) return null;
        const url = 'url' in item && typeof (item as { url?: unknown }).url === 'string' ? String((item as { url: string }).url) : null;
        return { objectKey: key, url: url ?? (/^https?:\/\//i.test(key) ? key : null) };
      }
      return null;
    })
    .filter((image): image is StoredImage => image !== null);
}

export function ManageVenueDetailPage() {
  const { venueId = '' } = useParams();
  const [venue, setVenue] = useState<ManagedVenue>();
  const [existingImages, setExistingImages] = useState<StoredImage[]>([]);
  const [courtName, setCourtName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [images, setImages] = useState<UploadImageState[]>([]);

  const load = useCallback(async () => {
    try {
      const next = await getMyManagedVenue(venueId);
      setVenue(next);
      setExistingImages(normalizeImages(next.images));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải cơ sở.');
    }
  }, [venueId]);
  useEffect(() => { void load(); }, [load]);

  const uploadingCount = useMemo(() => images.filter((image) => image.status === 'uploading').length, [images]);
  const failedCount = useMemo(() => images.filter((image) => image.status === 'error').length, [images]);

  const saveVenue = async () => {
    if (!venue || busy) return;
    if (!venue.name.trim() || !venue.address.trim()) { setError('Tên và địa chỉ cơ sở không được để trống.'); return; }
    if (uploadingCount > 0) { setError(`Còn ${uploadingCount} ảnh đang tải lên, vui lòng đợi.`); return; }
    setBusy('venue'); setError(''); setNotice('');
    try {
      const merged = [
        ...existingImages.map((image) => ({ objectKey: image.objectKey })),
        ...images.filter((image) => image.status === 'uploaded').map((image) => ({ objectKey: image.objectKey! })),
      ];
      await updateManagedVenue(venueId, {
        name: venue.name.trim(),
        address: venue.address.trim(),
        lat: venue.lat,
        lng: venue.lng,
        amenities: venue.amenities,
        images: merged,
      });
      setImages([]);
      await load();
      setNotice('Đã cập nhật cơ sở.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật cơ sở.');
    } finally { setBusy(null); }
  };

  const removeExistingImage = (objectKey: string) => {
    if (!venue) return;
    if (!window.confirm('Gỡ ảnh này khỏi cơ sở? Bạn cần bấm "Lưu thay đổi" để áp dụng.')) return;
    setExistingImages((current) => current.filter((image) => image.objectKey !== objectKey));
    setNotice('Ảnh sẽ bị gỡ sau khi bấm "Lưu thay đổi".');
  };

  const addCourt = async () => {
    if (!courtName.trim() || busy) return;
    setBusy('court'); setError(''); setNotice('');
    try {
      await addManagedCourt(venueId, courtName.trim());
      setCourtName('');
      await load();
      setNotice('Đã thêm sân con. Tiếp tục cấu hình lịch mở cửa và giá cho sân.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể thêm sân con.');
    } finally { setBusy(null); }
  };

  const deactivate = async (courtId: string) => {
    if (!window.confirm('Xác nhận ngưng hoạt động sân này? Các booking xung đột phải được xử lý trước.')) return;
    setBusy(courtId); setError(''); setNotice('');
    try {
      await deactivateManagedCourt(courtId);
      await load();
      setNotice('Đã ngưng hoạt động sân con.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể ngưng sân; hãy xử lý các booking xung đột trước.');
    } finally { setBusy(null); }
  };

  if (!venue) return error
    ? <RouteState variant="error" title="Không thể tải cơ sở" description={error} onRetry={() => void load()} />
    : <RouteState variant="loading" title="Đang tải cơ sở kinh doanh" />;

  const readyCourts = venue.courts.filter((court) => court.active && court.configuration.operatingHours > 0 && court.configuration.pricingRules > 0).length;

  return (
    <section className="grid gap-5">
      <SurfaceCard className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-h2">{venue.name || 'Chi tiết cơ sở'}</h2>
            <p className="mt-1 text-sm text-ink-500">
              {readyCourts}/{venue.courts.length} sân con đã đủ điều kiện xuất hiện trên tìm kiếm.
            </p>
          </div>
          <Link to="/manage/venues" className="text-sm font-semibold text-brand-navy hover:underline">← Danh sách</Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Tên cơ sở
            <TextInput aria-label="Tên cơ sở" value={venue.name} onChange={(event) => setVenue({ ...venue, name: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Địa chỉ
            <TextInput aria-label="Địa chỉ" value={venue.address} onChange={(event) => setVenue({ ...venue, address: event.target.value })} />
          </label>
        </div>

        <div className="grid gap-1.5 text-sm font-medium">
          <span>Vị trí trên bản đồ</span>
          <LocationPicker
            value={{ lat: venue.lat, lng: venue.lng }}
            onChange={(next) => setVenue({ ...venue, lat: next.lat, lng: next.lng })}
            onAddressResolved={(address) => setVenue((current) => (current ? { ...current, address } : current))}
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-h3">Ảnh cơ sở</h3>
            <span className="text-xs text-ink-500">{existingImages.length} ảnh hiện có</span>
          </div>
          {existingImages.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {existingImages.map((image) => (
                <figure key={image.objectKey} className="relative overflow-hidden rounded-xl border border-line bg-canvas">
                  {image.url ? (
                    <img src={image.url} alt="Ảnh cơ sở" loading="lazy" className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 items-center justify-center text-ink-400" aria-hidden="true">🖼️</div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeExistingImage(image.objectKey)}
                    className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-danger shadow hover:bg-white"
                    aria-label="Gỡ ảnh này"
                  >
                    Gỡ
                  </button>
                </figure>
              ))}
            </div>
          )}
          <ImageUploadPicker label="Thêm ảnh cơ sở" authorize={authorizeVenueImage} upload={uploadVenueImage} onUploadedChange={setImages} />
          {(uploadingCount > 0 || failedCount > 0) && (
            <p className="text-xs text-ink-500">
              {uploadingCount > 0 && <>Đang tải {uploadingCount} ảnh… </>}
              {failedCount > 0 && <span className="text-danger">{failedCount} ảnh lỗi, hãy thử lại hoặc gỡ trước khi lưu.</span>}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line pt-4">
          <Button disabled={busy !== null || uploadingCount > 0} onClick={() => void saveVenue()}>
            {busy === 'venue' ? 'Đang lưu…' : uploadingCount > 0 ? `Đợi ${uploadingCount} ảnh…` : 'Lưu thay đổi'}
          </Button>
          <span className="text-xs text-ink-500">Ảnh mới chỉ được lưu khi bấm nút này.</span>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-h3">Sân con</h3>
            <p className="mt-1 text-sm text-ink-500">Mỗi sân con cần có giờ mở cửa + bảng giá để xuất hiện trên tìm kiếm.</p>
          </div>
          <span className="text-xs text-ink-500">Tổng {venue.courts.length} sân</span>
        </div>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => { event.preventDefault(); void addCourt(); }}
        >
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
            <span>Tên sân con mới</span>
            <TextInput
              aria-label="Tên sân con"
              value={courtName}
              onChange={(event) => setCourtName(event.target.value)}
              placeholder="VD: Sân 1"
            />
          </label>
          <Button type="submit" disabled={busy !== null || !courtName.trim()}>
            {busy === 'court' ? 'Đang thêm…' : 'Thêm sân con'}
          </Button>
        </form>

        <div className="mt-4 grid gap-3">
          {venue.courts.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-500">
              Chưa có sân con nào. Thêm sân đầu tiên ở trên để bắt đầu.
            </p>
          )}
          {venue.courts.map((court) => {
            const hasHours = court.configuration.operatingHours > 0;
            const hasPricing = court.configuration.pricingRules > 0;
            const hasRule = court.configuration.bookingRule;
            const ready = court.active && hasHours && hasPricing;
            return (
              <article key={court.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-ink-900">{court.name}</strong>
                      {!court.active && <Badge tone="neutral">Đã ngưng</Badge>}
                      {court.active && (ready
                        ? <Badge tone="success">Sẵn sàng</Badge>
                        : <Badge tone="warning">Chưa cấu hình đủ</Badge>)}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      <li className={`rounded-full px-2 py-0.5 ${hasHours ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}>
                        Giờ mở: {hasHours ? `${court.configuration.operatingHours} khung` : 'Chưa có'}
                      </li>
                      <li className={`rounded-full px-2 py-0.5 ${hasPricing ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}>
                        Bảng giá: {hasPricing ? `${court.configuration.pricingRules} khung` : 'Chưa có'}
                      </li>
                      <li className={`rounded-full px-2 py-0.5 ${hasRule ? 'bg-success-bg text-success' : 'bg-canvas text-ink-500'}`}>
                        Quy tắc: {hasRule ? 'Đã có' : 'Mặc định'}
                      </li>
                    </ul>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/manage/venues/${venueId}/schedule?courtId=${court.id}`} className="text-sm font-semibold text-brand-navy hover:underline">
                      Lịch
                    </Link>
                    <Link to={`/manage/venues/${venueId}/pricing?courtId=${court.id}`} className="text-sm font-semibold text-brand-navy hover:underline">
                      Giá
                    </Link>
                    {court.active && (
                      <Button disabled={busy !== null} size="sm" tone="secondary" onClick={() => void deactivate(court.id)}>
                        {busy === court.id ? 'Đang xử lý…' : 'Ngưng hoạt động'}
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </SurfaceCard>

      {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-success-bg p-3 text-sm text-success">{notice}</p>}
    </section>
  );
}
