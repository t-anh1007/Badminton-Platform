import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, SurfaceCard, TextInput } from '../../components/ui';
import {
  createManagedVenue,
  addManagedCourt,
  saveBookingRule,
  replaceOperatingHours,
  savePricing,
  getMyManagedVenues,
  authorizeVenueImage,
  uploadVenueImage,
  type ManagedVenue,
} from '../../lib/venueBookingApi';
import { ImageUploadPicker, type UploadImageState } from '../../components/CommunityComposer';
import { LocationPicker, type PickedLocation } from '../../components/map/LocationPicker';

interface VenueForm { name: string; address: string; amenities: string }
interface CourtSetup { weekdays: number[]; openTime: string; closeTime: string; hourlyPrice: string; effectiveFrom: string }
interface CourtDraft { id: string; name: string; images: UploadImageState[]; setup: CourtSetup }
const emptyForm: VenueForm = { name: '', address: '', amenities: '' };
const SUGGESTED_AMENITIES = ['Wi-Fi', 'Bãi giữ xe', 'Nước uống', 'Phòng thay đồ', 'Nhà vệ sinh'] as const;
const WEEKDAYS = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'] as const;
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const BOOKING_STEP_MINUTES = 30;
const MIN_BOOKING_DURATION_MINUTES = 60;
const VND_FORMATTER = new Intl.NumberFormat('vi-VN');

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatVndInput(value: string): string {
  return value ? `${VND_FORMATTER.format(Number(value))} VNĐ` : '';
}

function createCourtSetup(): CourtSetup {
  return { weekdays: [...ALL_WEEKDAYS], openTime: '08:00', closeTime: '22:00', hourlyPrice: '100000', effectiveFrom: new Date().toISOString().slice(0, 10) };
}

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
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [courtDraft, setCourtDraft] = useState('');
  const [courts, setCourts] = useState<CourtDraft[]>([]);
  const [setupMode, setSetupMode] = useState<'shared' | 'individual'>('shared');
  const [weekdays, setWeekdays] = useState<number[]>(ALL_WEEKDAYS);
  const [openTime, setOpenTime] = useState('08:00');
  const [closeTime, setCloseTime] = useState('22:00');
  const [hourlyPrice, setHourlyPrice] = useState('100000');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
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
  const resetForm = () => {
    setForm(emptyForm); setSelectedAmenities([]); setCourtDraft(''); setCourts([]); setSetupMode('shared');
    setWeekdays(ALL_WEEKDAYS); setOpenTime('08:00'); setCloseTime('22:00');
    setHourlyPrice('100000'); setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setLocation(null); setImages([]); setFieldErrors({});
  };

  const toggleAmenity = (amenity: string) => {
    setSelectedAmenities((current) => current.includes(amenity)
      ? current.filter((item) => item !== amenity)
      : [...current, amenity]);
  };

  const addCourtName = () => {
    const name = courtDraft.trim();
    if (!name || courts.some((item) => item.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) return;
    setCourts((current) => [...current, { id: crypto.randomUUID(), name, images: [], setup: createCourtSetup() }]);
    setCourtDraft('');
  };

  const switchSetupMode = (mode: 'shared' | 'individual') => {
    if (mode === 'individual') {
      const shared = { weekdays: [...weekdays], openTime, closeTime, hourlyPrice, effectiveFrom };
      setCourts((current) => current.map((court) => ({ ...court, setup: { ...shared, weekdays: [...shared.weekdays] } })));
    }
    setSetupMode(mode);
  };

  const updateCourtSetup = (id: string, patch: Partial<CourtSetup>) => {
    setCourts((current) => current.map((court) => court.id === id ? { ...court, setup: { ...court.setup, ...patch } } : court));
  };

  const toggleWeekday = (weekday: number) => {
    setWeekdays((current) => current.includes(weekday)
      ? current.filter((item) => item !== weekday)
      : [...current, weekday].sort());
  };

  const uploadingCount = useMemo(() => [...images, ...courts.flatMap((court) => court.images)].filter((image) => image.status === 'uploading').length, [images, courts]);
  const failedCount = useMemo(() => [...images, ...courts.flatMap((court) => court.images)].filter((image) => image.status === 'error').length, [images, courts]);

  const submit = async () => {
    if (busy) return;
    const nextErrors: typeof fieldErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Vui lòng nhập tên cơ sở.';
    if (!form.address.trim()) nextErrors.address = 'Vui lòng nhập địa chỉ.';
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) nextErrors.location = 'Chọn vị trí cơ sở trên bản đồ.';
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); return; }
    if (courts.length === 0) { setError('Thêm ít nhất một sân con trước khi lưu cơ sở.'); return; }
    const courtWithoutImages = courts.find((court) => court.images.filter((image) => image.status === 'uploaded').length < 1);
    if (courtWithoutImages) { setError(`${courtWithoutImages.name} cần ít nhất 1 ảnh trước khi lưu.`); return; }
    if (weekdays.length === 0) { setError('Chọn ít nhất một ngày hoạt động trong tuần.'); return; }
    const resolvedCourts = courts.map((court) => {
      const setup = setupMode === 'shared' ? { weekdays, openTime, closeTime, hourlyPrice, effectiveFrom } : court.setup;
      const openMinute = toMinutes(setup.openTime); const closeMinute = toMinutes(setup.closeTime);
      const operatingDuration = closeMinute - openMinute;
      const price = Number(setup.hourlyPrice);
      return { court, setup, openMinute, closeMinute, operatingDuration, price };
    });
    const today = new Date().toISOString().slice(0, 10);
    const invalidCourt = resolvedCourts.find(({ setup, openMinute, closeMinute, operatingDuration, price }) => setup.weekdays.length === 0 || openMinute >= closeMinute || operatingDuration < MIN_BOOKING_DURATION_MINUTES || !Number.isSafeInteger(price) || price <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(setup.effectiveFrom) || setup.effectiveFrom < today);
    if (invalidCourt) { setError(`Kiểm tra lại lịch hoạt động và giá của ${invalidCourt.court.name}.`); return; }
    if (uploadingCount > 0) { setError(`Còn ${uploadingCount} ảnh đang tải lên, vui lòng đợi hoặc gỡ trước khi lưu.`); return; }
    setBusy(true); setError(''); setNotice('');
    let createdVenueId: string | null = null;
    try {
      const venue = await createManagedVenue({
        name: form.name.trim(),
        address: form.address.trim(),
        lat: location!.lat,
        lng: location!.lng,
        amenities: [...new Set([
          ...selectedAmenities,
          ...form.amenities.split(',').map((item) => item.trim()).filter(Boolean),
        ])],
        images: images.filter((image) => image.status === 'uploaded').map((image) => ({ objectKey: image.objectKey })),
      });
      createdVenueId = venue.id;
      for (const item of resolvedCourts) {
        const { court: draft, setup, openMinute, closeMinute, operatingDuration, price } = item;
        const court = await addManagedCourt(venue.id, draft.name, draft.images.filter((image) => image.status === 'uploaded').map((image) => ({ objectKey: image.objectKey! })));
        await replaceOperatingHours(court.id, setup.weekdays.map((weekday) => ({ weekday, openMinute, closeMinute })));
        await savePricing(court.id, {
          effectiveFrom: `${setup.effectiveFrom}T00:00:00.000Z`,
          rules: setup.weekdays.map((weekday) => ({ weekday, startMinute: openMinute, endMinute: closeMinute, price })),
        });
        await saveBookingRule(court.id, { stepMinutes: BOOKING_STEP_MINUTES, minDurationMinutes: MIN_BOOKING_DURATION_MINUTES, maxDurationMinutes: Math.floor(operatingDuration / BOOKING_STEP_MINUTES) * BOOKING_STEP_MINUTES });
      }
      setOpen(false); resetForm(); await load();
      setNotice(`Đã tạo cơ sở và cấu hình hoàn chỉnh ${courts.length} sân con.`);
    } catch (cause) {
      if (createdVenueId) {
        setOpen(false); resetForm(); await load();
        const reason = cause instanceof Error ? cause.message : 'Lỗi không xác định.';
        setError(`Cơ sở đã được tạo nhưng cấu hình sân con chưa hoàn tất: ${reason} Mở cơ sở vừa tạo để kiểm tra phần đã lưu.`);
      } else {
        setError(cause instanceof Error ? cause.message : 'Không thể lưu cơ sở.');
      }
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
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Tiện ích đề xuất</legend>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_AMENITIES.map((amenity) => {
            const selected = selectedAmenities.includes(amenity);
            return (
              <button
                key={amenity}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleAmenity(amenity)}
                className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition ${selected ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-surface text-brand-navy hover:border-brand-navy hover:bg-canvas'}`}
              >
                <span aria-hidden className="mr-1.5">{selected ? '✓' : '+'}</span>{amenity}
              </button>
            );
          })}
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Tiện ích khác
          <TextInput aria-label={FIELD_LABELS.amenities} value={form.amenities} onChange={(event) => change('amenities', event.target.value)} placeholder="VD: Cho thuê vợt, Căng vợt (phân cách bằng dấu phẩy)" />
        </label>
      </fieldset>

      <section className="grid gap-3 rounded-xl border border-line p-4">
        <div>
          <h4 className="font-bold text-ink-900">Sân con <span className="text-danger">*</span></h4>
          <p className="mt-1 text-xs text-ink-500">Mỗi sân có lịch, giá, quy tắc và 1–5 ảnh riêng.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); addCourtName(); }}>
          <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
            Tên sân con
            <TextInput aria-label="Tên sân con mới" value={courtDraft} onChange={(event) => setCourtDraft(event.target.value)} placeholder="VD: Sân 1" />
          </label>
          <Button type="submit" tone="secondary" disabled={!courtDraft.trim()}>+ Thêm sân</Button>
        </form>
        {courts.length > 0 && <>
          <div className="inline-flex w-fit overflow-hidden rounded-full border border-line bg-surface" role="group" aria-label="Kiểu thiết lập sân con">
            <button type="button" onClick={() => switchSetupMode('shared')} className={`min-h-11 px-4 text-sm font-semibold ${setupMode === 'shared' ? 'bg-brand-navy text-surface' : 'text-ink-600'}`}>Thiết lập chung</button>
            <button type="button" onClick={() => switchSetupMode('individual')} className={`min-h-11 px-4 text-sm font-semibold ${setupMode === 'individual' ? 'bg-brand-navy text-surface' : 'text-ink-600'}`}>Thiết lập riêng</button>
          </div>

          {setupMode === 'shared' && (
            <div className="grid gap-3 rounded-xl bg-canvas p-4">
              <strong>Cấu hình áp dụng cho tất cả sân con</strong>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((label, day) => { const selected = weekdays.includes(day); return <button key={label} type="button" aria-pressed={selected} onClick={() => toggleWeekday(day)} className={`min-h-10 rounded-full border px-3 py-2 text-sm font-semibold ${selected ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-surface text-ink-500'}`}>{selected ? '✓ ' : ''}{label}</button>; })}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-1.5 text-sm font-medium">Giờ mở<TextInput aria-label="Giờ mở chung" type="time" value={openTime} onChange={(event) => setOpenTime(event.target.value)} /></label>
                <label className="grid gap-1.5 text-sm font-medium">Giờ đóng<TextInput aria-label="Giờ đóng chung" type="time" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} /></label>
                <label className="grid gap-1.5 text-sm font-medium">Giá mỗi giờ<TextInput aria-label="Giá mỗi giờ chung" inputMode="numeric" value={formatVndInput(hourlyPrice)} onChange={(event) => setHourlyPrice(event.target.value.replace(/\D/g, ''))} /></label>
                <label className="grid gap-1.5 text-sm font-medium">Hiệu lực từ<TextInput aria-label="Ngày hiệu lực chung" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label>
              </div>
              <p className="text-xs text-ink-500">Slot 30 phút, tối thiểu 60 phút; tối đa theo giờ hoạt động.</p>
            </div>
          )}

          <div className="grid gap-3">
            {courts.map((court) => (
              <article key={court.id} className="grid gap-3 rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-3"><strong>{court.name}</strong><button type="button" aria-label={`Bỏ ${court.name}`} onClick={() => setCourts((current) => current.filter((item) => item.id !== court.id))} className="text-sm font-semibold text-danger">Bỏ sân</button></div>
                <ImageUploadPicker label={`Ảnh ${court.name} (bắt buộc 1–5 ảnh)`} maxFiles={5} authorize={authorizeVenueImage} upload={uploadVenueImage} onUploadedChange={(next) => setCourts((current) => current.map((item) => item.id === court.id ? { ...item, images: next } : item))} />
                {setupMode === 'individual' && <>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((label, day) => { const selected = court.setup.weekdays.includes(day); return <button key={label} type="button" aria-pressed={selected} onClick={() => updateCourtSetup(court.id, { weekdays: selected ? court.setup.weekdays.filter((item) => item !== day) : [...court.setup.weekdays, day].sort() })} className={`min-h-10 rounded-full border px-3 py-2 text-sm font-semibold ${selected ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-surface text-ink-500'}`}>{selected ? '✓ ' : ''}{label}</button>; })}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="grid gap-1.5 text-sm font-medium">Giờ mở<TextInput aria-label={`Giờ mở ${court.name}`} type="time" value={court.setup.openTime} onChange={(event) => updateCourtSetup(court.id, { openTime: event.target.value })} /></label>
                    <label className="grid gap-1.5 text-sm font-medium">Giờ đóng<TextInput aria-label={`Giờ đóng ${court.name}`} type="time" value={court.setup.closeTime} onChange={(event) => updateCourtSetup(court.id, { closeTime: event.target.value })} /></label>
                    <label className="grid gap-1.5 text-sm font-medium">Giá mỗi giờ<TextInput aria-label={`Giá mỗi giờ ${court.name}`} inputMode="numeric" value={formatVndInput(court.setup.hourlyPrice)} onChange={(event) => updateCourtSetup(court.id, { hourlyPrice: event.target.value.replace(/\D/g, '') })} /></label>
                    <label className="grid gap-1.5 text-sm font-medium">Hiệu lực từ<TextInput aria-label={`Ngày hiệu lực ${court.name}`} type="date" value={court.setup.effectiveFrom} onChange={(event) => updateCourtSetup(court.id, { effectiveFrom: event.target.value })} /></label>
                  </div>
                </>}
              </article>
            ))}
          </div>
        </>}
      </section>

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
          {busy ? 'Đang tạo và cấu hình…' : uploadingCount > 0 ? `Đợi ${uploadingCount} ảnh…` : 'Lưu và hoàn tất cấu hình'}
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
              ? (typeof imgs[0] === 'string' ? String(imgs[0]) : (imgs[0] as { url?: string }).url ?? null)
              : null;
            const courtSummary = venue.courts.length;
            const inactiveCourts = venue.courts.filter((court) => !court.active);
            const venueStopped = courtSummary > 0 && inactiveCourts.length === courtSummary;
            return (
              <Link key={venue.id} to={`/manage/venues/${venue.id}`} className="block rounded-2xl focus-visible:outline-none">
                <SurfaceCard hoverable className={`h-full !p-0 overflow-hidden ${venueStopped ? 'bg-ink-100 opacity-75' : ''}`}>
                  <div className="flex h-full flex-col">
                    <div className="aspect-video w-full overflow-hidden bg-ink-100">
                      {cover && /^(?:https?:\/\/|\/)/i.test(cover) ? (
                        <img src={cover} alt={`Ảnh ${venue.name}`} loading="lazy" className={`h-full w-full object-cover object-center ${venueStopped ? 'grayscale' : ''}`} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl text-ink-400" aria-hidden="true">🏸</div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <strong className="text-ink-900">{venue.name}</strong>
                      {venueStopped && <span className="mt-2 w-fit rounded-full bg-ink-200 px-2.5 py-1 text-xs font-semibold text-ink-600">Cơ sở đã ngừng hoạt động</span>}
                      {!venueStopped && inactiveCourts.length > 0 && <span className="mt-2 text-xs font-medium text-danger">Đã ngừng: {inactiveCourts.map((court) => court.name).join(', ')}</span>}
                      <p className="mt-1 text-sm text-ink-500">{venue.address}</p>
                      <p className="mt-auto pt-3 text-xs text-ink-500">
                        {courtSummary} sân con
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
