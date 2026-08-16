import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, SurfaceCard, TextInput } from '../../components/ui';
import {
  createManagedVenue,
  getMyManagedVenues,
  authorizeVenueImage,
  uploadVenueImage,
  type ManagedVenue,
} from '../../lib/venueBookingApi';
import { ImageUploadPicker, type UploadImageState } from '../../components/CommunityComposer';
import { LocationPicker, type PickedLocation } from '../../components/map/LocationPicker';

interface VenueForm { name: string; address: string; amenities: string }
const emptyForm: VenueForm = { name: '', address: '', amenities: '' };

const FIELD_LABELS: Record<keyof VenueForm, string> = {
  name: 'Tên cơ sở',
  address: 'Địa chỉ',
  amenities: 'Tiện ích',
};

export function ManageVenuesPage() {
  const [venues, setVenues] = useState<ManagedVenue[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof VenueForm | 'location', string>>>({});
  const [form, setForm] = useState<VenueForm>(emptyForm);
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [images, setImages] = useState<UploadImageState[]>([]);

  const load = useCallback(async () => {
    try { setVenues(await getMyManagedVenues()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách cơ sở.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const change = (key: keyof VenueForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };
  const pickLocation = (next: PickedLocation) => {
    setLocation(next);
    setFieldErrors((current) => ({ ...current, location: undefined }));
  };
  const resolveAddress = (address: string) => setForm((current) => (current.address.trim() ? current : { ...current, address }));
  const resetForm = () => { setForm(emptyForm); setLocation(null); setImages([]); setFieldErrors({}); };

  const uploadingCount = useMemo(() => images.filter((image) => image.status === 'uploading').length, [images]);
  const failedCount = useMemo(() => images.filter((image) => image.status === 'error').length, [images]);

  const submit = async () => {
    if (busy) return;
    const nextErrors: typeof fieldErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Vui lòng nhập tên cơ sở.';
    if (!form.address.trim()) nextErrors.address = 'Vui lòng nhập địa chỉ.';
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) nextErrors.location = 'Chọn vị trí cơ sở trên bản đồ.';
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); return; }
    if (uploadingCount > 0) { setError(`Còn ${uploadingCount} ảnh đang tải lên, vui lòng đợi hoặc gỡ trước khi lưu.`); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await createManagedVenue({
        name: form.name.trim(),
        address: form.address.trim(),
        lat: location!.lat,
        lng: location!.lng,
        amenities: form.amenities.split(',').map((item) => item.trim()).filter(Boolean),
        images: images.filter((image) => image.status === 'uploaded').map((image) => ({ objectKey: image.objectKey })),
      });
      setOpen(false); resetForm(); await load();
      setNotice('Đã tạo cơ sở. Tiếp theo, thêm sân con và cấu hình giờ + giá cho cơ sở.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu cơ sở.');
    } finally { setBusy(false); }
  };

  const formControl = open && (
    <SurfaceCard className="mt-4 grid gap-4">
      <div>
        <h3 className="text-h3">Thông tin cơ sở</h3>
        <p className="mt-1 text-sm text-ink-500">Điền các trường bắt buộc (*) rồi chọn vị trí trên bản đồ. Ảnh và tiện ích có thể bổ sung sau.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Tên cơ sở <span className="text-danger">*</span>
          <TextInput aria-label={FIELD_LABELS.name} value={form.name} onChange={(event) => change('name', event.target.value)} placeholder="VD: Sân cầu lông Bình Thạnh" />
          {fieldErrors.name && <span className="text-xs text-danger">{fieldErrors.name}</span>}
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Địa chỉ <span className="text-danger">*</span>
          <TextInput aria-label={FIELD_LABELS.address} value={form.address} onChange={(event) => change('address', event.target.value)} placeholder="Địa chỉ tự động điền khi chọn trên bản đồ" />
          {fieldErrors.address && <span className="text-xs text-danger">{fieldErrors.address}</span>}
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">
        Tiện ích (phân cách bằng dấu phẩy)
        <TextInput aria-label={FIELD_LABELS.amenities} value={form.amenities} onChange={(event) => change('amenities', event.target.value)} placeholder="Wi-Fi, Bãi xe, Nước uống" />
      </label>
      <div className="grid gap-1.5 text-sm font-medium">
        <span>Vị trí trên bản đồ <span className="text-danger">*</span></span>
        <LocationPicker value={location} onChange={pickLocation} onAddressResolved={resolveAddress} />
        {fieldErrors.location && <span className="text-xs text-danger">{fieldErrors.location}</span>}
      </div>
      <div>
        <ImageUploadPicker label="Ảnh cơ sở" authorize={authorizeVenueImage} upload={uploadVenueImage} onUploadedChange={setImages} />
        {(uploadingCount > 0 || failedCount > 0) && (
          <p className="mt-2 text-xs text-ink-500">
            {uploadingCount > 0 && <>Đang tải {uploadingCount} ảnh… </>}
            {failedCount > 0 && <span className="text-danger">{failedCount} ảnh lỗi, hãy thử lại hoặc gỡ trước khi lưu.</span>}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button disabled={busy || uploadingCount > 0} onClick={() => void submit()}>
          {busy ? 'Đang lưu…' : uploadingCount > 0 ? `Đợi ${uploadingCount} ảnh…` : 'Lưu cơ sở'}
        </Button>
        <Button tone="secondary" disabled={busy} onClick={() => { setOpen(false); resetForm(); }}>Hủy</Button>
        {uploadingCount === 0 && images.length > 0 && (
          <span className="text-xs text-ink-500">Đã tải {images.filter((image) => image.status === 'uploaded').length}/{images.length} ảnh.</span>
        )}
      </div>
    </SurfaceCard>
  );

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h2">Cơ sở kinh doanh</h2>
          <p className="mt-1 text-sm text-ink-500">Quản lý địa điểm, sân con và mức độ hoàn thiện cấu hình.</p>
        </div>
        {venues.length > 0 && !open && <Button onClick={() => setOpen(true)}>+ Thêm sân kinh doanh</Button>}
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-xl bg-success-bg p-3 text-sm text-success">{notice}</p>}
      {formControl}
      {venues.length === 0 && !open ? (
        <EmptyState
          title="Chưa có cơ sở"
          description="Bắt đầu thêm sân kinh doanh."
          action={<Button onClick={() => setOpen(true)}>Thêm sân kinh doanh</Button>}
        />
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {venues.map((venue) => {
            const imgs = Array.isArray(venue.images) ? venue.images : [];
            const cover = imgs.length > 0
              ? (typeof imgs[0] === 'string' ? String(imgs[0]) : (imgs[0] as { objectKey?: string }).objectKey ?? null)
              : null;
            const courtSummary = venue.courts.length;
            return (
              <Link key={venue.id} to={`/manage/venues/${venue.id}`} className="block rounded-2xl focus-visible:outline-none">
                <SurfaceCard hoverable className="h-full !p-0 overflow-hidden">
                  <div className="flex h-full flex-col">
                    <div className="aspect-[16/9] w-full bg-ink-100">
                      {cover && /^https?:\/\//i.test(cover) ? (
                        <img src={cover} alt={`Ảnh ${venue.name}`} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl text-ink-400" aria-hidden="true">🏸</div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <strong className="text-ink-900">{venue.name}</strong>
                      <p className="mt-1 text-sm text-ink-500">{venue.address}</p>
                      <p className="mt-auto pt-3 text-xs text-ink-500">
                        {courtSummary} sân con · {imgs.length} ảnh
                      </p>
                    </div>
                  </div>
                </SurfaceCard>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
