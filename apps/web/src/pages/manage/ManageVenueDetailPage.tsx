import { VIETNAM_PROVINCES } from '@khoaluantn/shared';
import { BusinessCode } from '../../components/BusinessCode.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Modal, SelectInput, TextInput } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { CourtClosureDialog } from './CourtClosureDialog.js';
import { activateManagedCourt, activateManagedVenue, addManagedCourt, authorizeVenueImage, getMyManagedVenue, getOperationalShutdown, reactivateOperationalShutdown, replaceOperatingHours, saveBookingRule, savePricing, updateManagedCourt, updateManagedVenue, uploadVenueImage, type ManagedCourt, type ManagedVenue, type OperationalShutdownStatus } from '../../lib/venueBookingApi';
import { ImageUploadPicker, type UploadImageState } from '../../components/CommunityComposer';
import { RouteState } from '../../components/RouteState.js';
import { LocationPicker } from '../../components/map/LocationPicker';
import { OperationalShutdownDialog } from './OperationalShutdownDialog.js';
import { formatDateTimeVi, formatDateVi, formatMoneyVnd } from '../../lib/formatters.js';

const SUGGESTED_AMENITIES = ['Wi-Fi', 'Bãi giữ xe', 'Nước uống', 'Phòng thay đồ', 'Nhà vệ sinh'] as const;
const WEEKDAYS = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'] as const;
const VND = new Intl.NumberFormat('vi-VN');
interface CourtDraft { id: string; name: string; weekdays: number[]; openTime: string; closeTime: string; hourlyPrice: string; effectiveFrom: string; imageKeys: string[] }
interface VenueDraft { name: string; address: string; provinceCode: string; lat: number; lng: number; amenities: string[]; otherAmenities: string; imageKeys: string[]; courts: CourtDraft[] }

const minuteToTime = (minute: number) => `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
const toMinutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
const formatVnd = (value: string) => value ? `${VND.format(Number(value))} VNĐ` : '';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const keyOf = (item: unknown) => typeof item === 'string' ? item : item && typeof item === 'object' && 'objectKey' in item ? String((item as { objectKey: unknown }).objectKey) : null;
const urlOf = (item: unknown) => typeof item === 'string' && /^(?:https?:\/\/|\/)/.test(item) ? item : item && typeof item === 'object' && 'url' in item ? String((item as { url: unknown }).url) : null;

function courtDraft(court: ManagedCourt): CourtDraft {
  const hours = [...court.operatingHours].sort((a, b) => a.weekday - b.weekday);
  const latest = Math.max(0, ...court.pricingRules.map((item) => item.version));
  const price = court.pricingRules.find((item) => item.version === latest) ?? court.pricingRules[0];
  return { id: court.id, name: court.name, weekdays: hours.map((item) => item.weekday), openTime: minuteToTime(hours[0]?.openMinute ?? 480), closeTime: minuteToTime(hours[0]?.closeMinute ?? 1320), hourlyPrice: price?.price ?? '100000', effectiveFrom: price?.effectiveFrom?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), imageKeys: court.images.map((item) => item.objectKey) };
}
function venueDraft(venue: ManagedVenue): VenueDraft {
  const amenities = Array.isArray(venue.amenities) ? venue.amenities.map(String) : [];
  return { name: venue.name, address: venue.address, provinceCode: venue.provinceCode ?? '', lat: venue.lat, lng: venue.lng, amenities, otherAmenities: amenities.filter((item) => !SUGGESTED_AMENITIES.some((suggested) => suggested === item)).join(', '), imageKeys: Array.isArray(venue.images) ? venue.images.flatMap((item) => keyOf(item) ?? []) : [], courts: venue.courts.map(courtDraft) };
}

export function ManageVenueDetailPage() {
  const { venueId = '' } = useParams();
  const navigate = useNavigate();
  const [source, setSource] = useState<ManagedVenue>(); const [original, setOriginal] = useState<VenueDraft>(); const [draft, setDraft] = useState<VenueDraft>();
  const [editing, setEditing] = useState(false); const [confirming, setConfirming] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [shutdownTarget, setShutdownTarget] = useState<{ scope: 'venue' | 'court'; id: string; label: string }>();
  const [activating, setActivating] = useState<{ kind: 'venue' | 'court'; id: string; label: string }>();
  const [shutdownStatuses, setShutdownStatuses] = useState<Record<string, OperationalShutdownStatus | null>>({});
  const [courtMenu, setCourtMenu] = useState(''); const [closureCourtId, setClosureCourtId] = useState('');
  const [venueUploads, setVenueUploads] = useState<UploadImageState[]>([]); const [courtUploads, setCourtUploads] = useState<Record<string, UploadImageState[]>>({}); const [pickerVersion, setPickerVersion] = useState(0);
  const load = useCallback(async () => { try {
    const next = await getMyManagedVenue(venueId);
    const statuses = await Promise.all([
      getOperationalShutdown('venue', venueId),
      ...next.courts.map((court) => getOperationalShutdown('court', court.id)),
    ]);
    setShutdownStatuses(Object.fromEntries([[venueId, statuses[0]], ...next.courts.map((court, index) => [court.id, statuses[index + 1]])]));
    const mapped = venueDraft(next); setSource(next); setOriginal(mapped); setDraft(mapped); setError('');
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải cơ sở.'); } }, [venueId]);
  useEffect(() => { void load(); }, [load]);
  const uploaded = (items: UploadImageState[]) => items.filter((item) => item.status === 'uploaded').map((item) => item.objectKey!);
  const allUploads = useMemo(() => [...venueUploads, ...Object.values(courtUploads).flat()], [venueUploads, courtUploads]);
  const changes = useMemo(() => { if (!draft || !original) return []; const list: string[] = []; if (draft.name !== original.name) list.push(`Tên cơ sở: “${original.name}” → “${draft.name}”`); if (draft.address !== original.address) list.push('Địa chỉ cơ sở'); if (draft.provinceCode !== original.provinceCode) list.push('Tỉnh/thành'); if (draft.lat !== original.lat || draft.lng !== original.lng) list.push('Vị trí bản đồ'); if (!same(draft.amenities, original.amenities) || draft.otherAmenities !== original.otherAmenities) list.push('Danh sách tiện ích'); if (!same(draft.imageKeys, original.imageKeys) || uploaded(venueUploads).length) list.push('Ảnh cơ sở'); for (const court of draft.courts) { const before = original.courts.find((item) => item.id === court.id); if (!before) { list.push(`Thêm sân “${court.name}”`); continue; } if (court.name !== before.name) list.push(`${before.name}: đổi tên`); if (!same(court.weekdays, before.weekdays) || court.openTime !== before.openTime || court.closeTime !== before.closeTime) list.push(`${court.name}: lịch hoạt động`); if (court.hourlyPrice !== before.hourlyPrice || court.effectiveFrom !== before.effectiveFrom) list.push(`${court.name}: giá`); if (!same(court.imageKeys, before.imageKeys) || uploaded(courtUploads[court.id] ?? []).length) list.push(`${court.name}: ảnh`); } return list; }, [draft, original, venueUploads, courtUploads]);
  if (!draft || !original || !source) return error ? <RouteState variant="error" title="Không thể tải cơ sở" description={error} onRetry={() => void load()} /> : <RouteState variant="loading" title="Đang tải cơ sở kinh doanh" />;

  const closureCourt = source.courts.find((court) => court.id === closureCourtId);
  const patchCourt = (id: string, patch: Partial<CourtDraft>) => setDraft({ ...draft, courts: draft.courts.map((court) => court.id === id ? { ...court, ...patch } : court) });
  const cancel = () => { setDraft(structuredClone(original)); setEditing(false); setConfirming(false); setVenueUploads([]); setCourtUploads({}); setPickerVersion((value) => value + 1); setError(''); };
  const confirmActivation = async () => { if (!activating) return; setBusy(true); setError(''); try {
    if (shutdownStatuses[activating.id]) await reactivateOperationalShutdown(activating.kind, activating.id);
    else if (activating.kind === 'venue') await activateManagedVenue(activating.id);
    else await activateManagedCourt(activating.id);
    setActivating(undefined); await load(); setNotice('Đã kích hoạt lại. Những lịch từng bị hủy không được khôi phục.');
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể kích hoạt lại.'); } finally { setBusy(false); } };
  const requestSave = () => { if (!draft.name.trim() || !draft.address.trim()) return setError('Tên và địa chỉ cơ sở không được để trống.'); if (!draft.provinceCode) return setError('Chọn tỉnh/thành của cơ sở trước khi lưu.'); if (allUploads.some((item) => item.status === 'uploading')) return setError('Hãy đợi tất cả ảnh tải xong.'); const today = new Date().toISOString().slice(0, 10); for (const court of draft.courts) { const before = original.courts.find((item) => item.id === court.id); const priceChanged = !before || before.hourlyPrice !== court.hourlyPrice || before.effectiveFrom !== court.effectiveFrom; const count = court.imageKeys.length + uploaded(courtUploads[court.id] ?? []).length; if (!court.name.trim() || count < 1 || count > 5 || !court.weekdays.length || toMinutes(court.openTime) >= toMinutes(court.closeTime) || !Number.isSafeInteger(Number(court.hourlyPrice)) || Number(court.hourlyPrice) <= 0) return setError(`Kiểm tra lại tên, ảnh, lịch và giá của ${court.name || 'sân con'}.`); if (priceChanged && court.effectiveFrom < today) return setError(`Ngày hiệu lực giá mới của ${court.name} không được ở quá khứ.`); } if (!changes.length) return setNotice('Chưa có thay đổi để lưu.'); setError(''); setConfirming(true); };
  const save = async () => { setBusy(true); setError(''); try { const amenities = [...new Set([...draft.amenities.filter((item) => SUGGESTED_AMENITIES.some((suggested) => suggested === item)), ...draft.otherAmenities.split(',').map((item) => item.trim()).filter(Boolean)])]; await updateManagedVenue(venueId, { name: draft.name.trim(), address: draft.address.trim(), provinceCode: draft.provinceCode, lat: draft.lat, lng: draft.lng, amenities, images: [...draft.imageKeys, ...uploaded(venueUploads)].map((objectKey) => ({ objectKey })) }); for (const next of draft.courts) { const before = original.courts.find((item) => item.id === next.id); const images = [...next.imageKeys, ...uploaded(courtUploads[next.id] ?? [])]; const entity = before ? null : await addManagedCourt(venueId, next.name.trim(), images.map((objectKey) => ({ objectKey }))); const id = entity?.id ?? next.id; if (before && (before.name !== next.name || !same(before.imageKeys, images))) await updateManagedCourt(id, { name: next.name.trim(), images: images.map((objectKey) => ({ objectKey })) }); const scheduleChanged = !before || !same(before.weekdays, next.weekdays) || before.openTime !== next.openTime || before.closeTime !== next.closeTime; if (scheduleChanged) await replaceOperatingHours(id, next.weekdays.map((weekday) => ({ weekday, openMinute: toMinutes(next.openTime), closeMinute: toMinutes(next.closeTime) }))); const priceChanged = !before || before.hourlyPrice !== next.hourlyPrice || before.effectiveFrom !== next.effectiveFrom; if (priceChanged || scheduleChanged) await savePricing(id, { effectiveFrom: `${(priceChanged ? next.effectiveFrom : new Date().toISOString().slice(0, 10))}T00:00:00.000Z`, rules: next.weekdays.map((weekday) => ({ weekday, startMinute: toMinutes(next.openTime), endMinute: toMinutes(next.closeTime), price: Number(next.hourlyPrice) })) }); if (!before || scheduleChanged) await saveBookingRule(id, { stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: Math.floor((toMinutes(next.closeTime) - toMinutes(next.openTime)) / 30) * 30 }); } setConfirming(false); setEditing(false); setVenueUploads([]); setCourtUploads({}); setPickerVersion((value) => value + 1); navigate('/manage/venues', { replace: true }); } catch (cause) { setConfirming(false); setError(cause instanceof TypeError ? 'Không kết nối được máy chủ nên chưa lưu được thay đổi. Kiểm tra mạng rồi bấm Lưu lại.' : cause instanceof Error ? cause.message : 'Không thể lưu thay đổi.'); } finally { setBusy(false); } };

  const existingVenueImages = Array.isArray(source.images) ? source.images : [];
  const venueShutdown = shutdownStatuses[venueId];
  const venueInactive = venueShutdown?.operationalStatus === 'inactive' || !venueShutdown && !source.courts.some((court) => court.active);
  const venueStatus = venueShutdown ? (venueShutdown.operationalStatus === 'inactive' ? ['Ngừng hoạt động', 'danger'] : ['Đang ngừng dần', 'warning']) : venueInactive ? ['Ngừng hoạt động', 'danger'] : ['Đang hoạt động', 'success'];
  const courtInactive = (court: ManagedCourt) => shutdownStatuses[court.id]?.operationalStatus === 'inactive' || !shutdownStatuses[court.id] && !court.active;
  const amenityText = [...draft.amenities.filter((item) => SUGGESTED_AMENITIES.some((suggested) => suggested === item)), ...draft.otherAmenities.split(',').map((item) => item.trim()).filter(Boolean)].join(' · ');
  const card = 'surface-card grid gap-4 p-5';
  return <section className="grid gap-4">
    <Link to="/manage/venues" className="flex w-fit items-center gap-1 text-sm font-semibold text-ink-500 hover:text-brand-navy"><Icon name="chevronLeft" className="h-4 w-4" />Cơ sở</Link>
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-h2">{draft.name}</h1><div className="mt-1 flex flex-wrap items-center gap-2"><BusinessCode code={source.businessCode} label="Mã cơ sở" />{!editing && <Badge tone={venueStatus[1] as 'success'}>{venueStatus[0]}</Badge>}</div></div>
      <div className="flex flex-wrap gap-2">{editing ? <><Button tone="secondary" size="sm" onClick={cancel}>Hủy</Button><Button size="sm" onClick={requestSave}>Lưu thay đổi</Button></> : <>{source.courts.length > 0 && (venueInactive
        ? <Button tone="secondary" size="sm" onClick={() => setActivating({ kind: 'venue', id: venueId, label: draft.name })}>Kích hoạt lại cơ sở</Button>
        : <Button tone="secondary" size="sm" onClick={() => setShutdownTarget({ scope: 'venue', id: venueId, label: draft.name })}><Icon name="pause" className="h-4 w-4" />{venueShutdown ? 'Thay đổi cách ngừng hoạt động' : 'Ngừng hoạt động cơ sở'}</Button>)}<Button size="sm" onClick={() => { setEditing(true); setNotice(''); }}><Icon name="edit" className="h-4 w-4" />Sửa</Button></>}</div>
    </header>
    {venueShutdown && <ShutdownStatusBanner status={venueShutdown} />}
    {editing ? <>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className={card}><h2 className="text-h3">Thông tin</h2><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Tên cơ sở<TextInput aria-label="Tên cơ sở" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="grid gap-1 text-sm">Tỉnh/thành<SelectInput aria-label="Tỉnh/thành" value={draft.provinceCode} onChange={(event) => setDraft({ ...draft, provinceCode: event.target.value })}><option value="">Chọn tỉnh/thành</option>{VIETNAM_PROVINCES.map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}</SelectInput></label></div><label className="grid gap-1 text-sm">Địa chỉ<TextInput aria-label="Địa chỉ" value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label><div><span className="text-sm">Tiện ích</span><div className="mt-2 flex flex-wrap gap-2">{SUGGESTED_AMENITIES.map((amenity) => { const selected = draft.amenities.includes(amenity); return <button key={amenity} type="button" aria-pressed={selected} onClick={() => setDraft({ ...draft, amenities: selected ? draft.amenities.filter((item) => item !== amenity) : [...draft.amenities, amenity] })} className={`min-h-9 rounded-full border px-3 text-sm font-semibold ${selected ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-surface text-ink-700 hover:border-brand-navy'}`}>{amenity}</button>; })}</div></div><label className="grid gap-1 text-sm">Tiện ích khác<TextInput aria-label="Tiện ích khác" value={draft.otherAmenities} onChange={(event) => setDraft({ ...draft, otherAmenities: event.target.value })} /></label>
          <div><span className="text-sm">Ảnh cơ sở</span><div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">{existingVenueImages.filter((item) => { const key = keyOf(item); return key && draft.imageKeys.includes(key); }).map((item) => { const key = keyOf(item)!; const url = urlOf(item); return <figure key={key} className="relative h-20 overflow-hidden rounded-xl bg-canvas">{url && <img src={url} alt="Ảnh cơ sở" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}<button type="button" onClick={() => setDraft({ ...draft, imageKeys: draft.imageKeys.filter((value) => value !== key) })} className="absolute right-1 top-1 rounded bg-white px-2 py-1 text-xs text-danger">Gỡ</button></figure>; })}</div><ImageUploadPicker key={`venue-${pickerVersion}`} label="Thêm ảnh cơ sở" authorize={authorizeVenueImage} upload={uploadVenueImage} onUploadedChange={setVenueUploads} /></div></section>
        <section className={card}><h2 className="text-h3">Vị trí</h2><LocationPicker initialQuery={draft.address} value={{ lat: draft.lat, lng: draft.lng }} onChange={(next) => setDraft({ ...draft, ...next })} onAddressResolved={(address) => setDraft((current) => current ? { ...current, address } : current)} /></section>
      </div>
      <section className={card}>
        <div className="flex items-center justify-between gap-3"><h2 className="text-h3">Sân con</h2><Button tone="secondary" size="sm" onClick={() => setDraft({ ...draft, courts: [...draft.courts, { id: `new-${crypto.randomUUID()}`, name: `Sân ${draft.courts.length + 1}`, weekdays: [0,1,2,3,4,5,6], openTime: '08:00', closeTime: '22:00', hourlyPrice: '100000', effectiveFrom: new Date().toISOString().slice(0,10), imageKeys: [] }] })}><Icon name="plus" className="h-4 w-4" />Thêm sân con</Button></div>
        {draft.courts.map((court) => <CourtEditor key={court.id} court={court} stored={source.courts.find((item) => item.id === court.id)} pickerVersion={pickerVersion} patch={(patch) => patchCourt(court.id, patch)} onUploads={(items) => setCourtUploads((current) => ({ ...current, [court.id]: items }))} />)}
      </section>
    </> : <>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <section className={card}><h2 className="text-h3">Thông tin</h2><dl className="text-sm">{[['Địa chỉ', draft.address], ['Tỉnh/thành', VIETNAM_PROVINCES.find((province) => province.code === draft.provinceCode)?.name ?? '—'], ['Tiện ích', amenityText || '—']].map(([label, value]) => <div key={label} className="flex justify-between gap-6 border-t border-line py-2.5"><dt className="text-ink-500">{label}</dt><dd className="text-right">{value}</dd></div>)}</dl>
          {existingVenueImages.length > 0 && <div className="flex flex-wrap gap-2">{existingVenueImages.map((item) => { const url = urlOf(item); return <figure key={keyOf(item) ?? url} className="grid h-20 w-28 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-green-600 to-brand-navy font-display text-xl font-extrabold text-white">{draft.name.slice(0, 1)}{url && <img src={url} alt="Ảnh cơ sở" className="col-start-1 row-start-1 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</figure>; })}</div>}</section>
        <section className="surface-card overflow-hidden"><LocationPicker disabled value={{ lat: draft.lat, lng: draft.lng }} onChange={() => undefined} /></section>
      </div>
      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5"><h2 className="text-h3">Sân con</h2><Button tone="secondary" size="sm" onClick={() => setEditing(true)}><Icon name="plus" className="h-4 w-4" />Thêm sân con</Button></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-canvas text-left text-xs font-bold uppercase tracking-wide text-ink-500"><tr><th className="px-5 py-3">Sân</th><th className="px-3 py-3">Ngày mở</th><th className="px-3 py-3">Giờ</th><th className="px-3 py-3">Giá/giờ</th><th className="px-3 py-3">Khóa lịch</th><th className="px-3 py-3">Trạng thái</th><th className="px-5 py-3"><span className="sr-only">Thao tác</span></th></tr></thead>
          <tbody>{source.courts.map((stored) => {
            const court = draft.courts.find((item) => item.id === stored.id) ?? courtDraft(stored);
            const shutdown = shutdownStatuses[stored.id];
            const inactive = courtInactive(stored);
            const today = new Date().toLocaleDateString('en-CA');
            const locks = (stored.closures ?? []).filter((item) => item.date.slice(0, 10) >= today);
            return <tr key={stored.id} className="border-t border-line align-middle">
              <td className="px-5 py-3"><p className="font-bold text-ink-900">{stored.name}</p><BusinessCode code={stored.businessCode} label="Mã sân" /></td>
              <td className="px-3 py-3">{court.weekdays.length === 7 ? 'Cả tuần' : court.weekdays.map((day) => WEEKDAYS[day]).join(', ') || '—'}</td>
              <td className="text-figures px-3 py-3">{court.openTime}–{court.closeTime}</td>
              <td className="text-figures px-3 py-3">{formatMoneyVnd(court.hourlyPrice)}</td>
              <td className="px-3 py-3 text-ink-500">{locks.length ? `${locks.length} lịch khóa · ${formatDateVi(locks[0].date)}` : '—'}</td>
              <td className="px-3 py-3">{shutdown ? <Badge tone={shutdown.operationalStatus === 'inactive' ? 'danger' : 'warning'}>{shutdown.operationalStatus === 'inactive' ? 'Ngừng hoạt động' : 'Đang ngừng dần'}</Badge> : <Badge tone={inactive ? 'danger' : 'success'}>{inactive ? 'Ngừng hoạt động' : 'Hoạt động'}</Badge>}</td>
              <td className="relative px-5 py-3 text-right">
                <button type="button" aria-label={`Tùy chọn ${stored.name}`} aria-haspopup="menu" aria-expanded={courtMenu === stored.id} onClick={() => setCourtMenu(courtMenu === stored.id ? '' : stored.id)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-canvas"><Icon name="more" /></button>
                {courtMenu === stored.id && <div role="menu" className="absolute right-5 top-12 z-20 grid w-56 rounded-2xl border border-line bg-surface p-1.5 text-left shadow-[var(--shadow-raised)]">
                  <button role="menuitem" type="button" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-semibold hover:bg-canvas" onClick={() => { setCourtMenu(''); setClosureCourtId(stored.id); }}><Icon name="lock" className="h-4 w-4" />Khóa lịch</button>
                  {inactive
                    ? <button role="menuitem" type="button" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-semibold hover:bg-canvas" onClick={() => { setCourtMenu(''); setActivating({ kind: 'court', id: stored.id, label: stored.name }); }}><Icon name="refresh" className="h-4 w-4" />Kích hoạt lại</button>
                    : <button role="menuitem" type="button" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-semibold text-danger hover:bg-danger-bg" onClick={() => { setCourtMenu(''); setShutdownTarget({ scope: 'court', id: stored.id, label: stored.name }); }}><Icon name="pause" className="h-4 w-4" />{shutdown ? 'Thay đổi cách ngừng' : 'Ngừng hoạt động sân'}</button>}
                </div>}
              </td>
            </tr>;
          })}</tbody></table></div>
        {source.courts.filter((court) => shutdownStatuses[court.id]).map((court) => <div key={court.id} className="border-t border-line p-4"><p className="mb-2 text-xs font-bold text-ink-500">{court.name}</p><ShutdownStatusBanner status={shutdownStatuses[court.id]!} /></div>)}
      </section>
    </>}
    {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-danger">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-success-bg p-3 text-success">{notice}</p>}
    <Modal open={confirming} title="Xác nhận thay đổi" onClose={() => !busy && setConfirming(false)}><ul className="grid gap-2">{changes.map((item) => <li key={item} className="rounded-xl bg-canvas p-3 text-sm">{item}</li>)}</ul><div className="mt-5 flex justify-end gap-2"><Button tone="secondary" disabled={busy} onClick={() => setConfirming(false)}>Quay lại sửa</Button><Button disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Xác nhận lưu'}</Button></div></Modal>
    {shutdownTarget && <OperationalShutdownDialog key={`${shutdownTarget.scope}:${shutdownTarget.id}`} target={shutdownTarget} current={shutdownStatuses[shutdownTarget.id] ?? null} onClose={() => setShutdownTarget(undefined)} onDone={load} />}
    {closureCourt && <CourtClosureDialog court={closureCourt} onClose={() => setClosureCourtId('')} onChanged={load} />}
    <Modal open={Boolean(activating)} title="Xác nhận kích hoạt lại" onClose={() => !busy && setActivating(undefined)}>
      <p className="text-sm text-ink-600">{activating?.kind === 'venue' ? `“${activating.label}” sẽ nhận lịch đặt mới trở lại.` : `Sân “${activating?.label}” sẽ nhận lịch đặt mới trở lại.`}</p>
      <p className="mt-2 text-xs text-ink-500">Những lịch từng bị hủy không được tự động khôi phục.</p>
      <div className="mt-5 flex justify-end gap-2"><Button tone="secondary" disabled={busy} onClick={() => setActivating(undefined)}>Quay lại</Button><Button disabled={busy} onClick={() => void confirmActivation()}>{busy ? 'Đang xử lý…' : 'Xác nhận kích hoạt'}</Button></div>
    </Modal>
  </section>;
}

export function ShutdownStatusBanner({ status }: { status: OperationalShutdownStatus }) {
  const title = status.operationalStatus === 'inactive' ? 'Đã ngừng hoạt động'
    : status.mode === 'winding_down' ? 'Ngừng nhận lịch đặt mới'
      : `Đóng cửa từ ngày ${status.effectiveAt ? formatDateVi(status.effectiveAt) : 'đã chọn'}`;
  const detail = status.resolutionStatus === 'needs_attention' ? 'Một số lịch đặt cần được hệ thống hỗ trợ xử lý.'
    : status.resolutionStatus === 'processing' ? 'Các lịch bị ảnh hưởng đang được hủy và hoàn tiền cho khách.'
      : status.operationalStatus === 'inactive' && status.mode === 'winding_down' ? 'Các lịch đã nhận đã kết thúc.'
      : status.operationalStatus !== 'inactive' && status.mode === 'winding_down' && status.expectedInactiveAt ? `Các lịch đã nhận vẫn được phục vụ đến ${formatDateTimeVi(status.expectedInactiveAt)}.`
        : status.resolutionStatus === 'completed' ? 'Đã xử lý xong các lịch bị ảnh hưởng.' : 'Không có lịch đặt nào cần hủy.';
  return <div role="status" className="rounded-xl border border-brand-navy/20 bg-brand-navy/5 p-4 text-sm">
    <p className="font-bold text-brand-navy">{title}</p><p className="mt-1 text-ink-600">{detail}</p>
  </div>;
}

function CourtEditor({ court, stored, pickerVersion, patch, onUploads }: { court: CourtDraft; stored?: ManagedCourt; pickerVersion: number; patch: (patch: Partial<CourtDraft>) => void; onUploads: (items: UploadImageState[]) => void }) {
  return <article className="grid gap-3 rounded-xl bg-canvas p-4">
    <div className="flex flex-wrap items-end gap-3"><label className="grid min-w-48 flex-1 gap-1 text-sm">Tên sân con<TextInput value={court.name} onChange={(event) => patch({ name: event.target.value })} /></label>{stored && <BusinessCode code={stored.businessCode} label="Mã sân" />}</div>
    <div className="flex flex-wrap gap-2">{WEEKDAYS.map((label, day) => { const selected = court.weekdays.includes(day); return <button key={day} type="button" aria-pressed={selected} onClick={() => patch({ weekdays: selected ? court.weekdays.filter((item) => item !== day) : [...court.weekdays, day].sort() })} className={`min-h-9 rounded-full border px-3 text-sm font-semibold ${selected ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-surface text-ink-500'}`}>{label}</button>; })}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1 text-sm">Giờ mở<TextInput type="time" value={court.openTime} onChange={(event) => patch({ openTime: event.target.value })} /></label><label className="grid gap-1 text-sm">Giờ đóng<TextInput type="time" value={court.closeTime} onChange={(event) => patch({ closeTime: event.target.value })} /></label><label className="grid gap-1 text-sm">Giá mỗi giờ<TextInput inputMode="numeric" value={formatVnd(court.hourlyPrice)} onChange={(event) => patch({ hourlyPrice: event.target.value.replace(/\D/g, '') })} /></label><label className="grid gap-1 text-sm">Hiệu lực từ<TextInput type="date" value={court.effectiveFrom} onChange={(event) => patch({ effectiveFrom: event.target.value })} /></label></div>
    <div className="flex flex-wrap gap-2">{stored?.images.filter((image) => court.imageKeys.includes(image.objectKey)).map((image) => <figure key={image.objectKey} className="relative h-20 w-28 overflow-hidden rounded-xl bg-surface"><img src={image.url} alt={`Ảnh ${court.name}`} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /><button type="button" onClick={() => patch({ imageKeys: court.imageKeys.filter((key) => key !== image.objectKey) })} className="absolute right-1 top-1 rounded bg-white px-2 py-1 text-xs text-danger">Gỡ</button></figure>)}</div>
    <ImageUploadPicker key={`${court.id}-${pickerVersion}`} label={`Thêm ảnh ${court.name}`} maxFiles={Math.max(1, 5 - court.imageKeys.length)} authorize={authorizeVenueImage} upload={uploadVenueImage} onUploadedChange={onUploads} />
  </article>;
}
