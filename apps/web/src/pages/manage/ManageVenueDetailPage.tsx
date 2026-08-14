import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, SurfaceCard } from '../../components/ui'
import { addManagedCourt, deactivateManagedCourt, getMyManagedVenue, updateManagedVenue, authorizeVenueImage, uploadVenueImage, type ManagedVenue } from '../../lib/venueBookingApi'
import { ImageUploadPicker, type UploadImageState } from '../../components/CommunityComposer'

export function ManageVenueDetailPage() {
  const { venueId = '' } = useParams(); const [venue, setVenue] = useState<ManagedVenue>(); const [courtName, setCourtName] = useState(''); const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [images, setImages] = useState<UploadImageState[]>([])
  const load = useCallback(async () => { try { setVenue(await getMyManagedVenue(venueId)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải cơ sở.') } }, [venueId])
  useEffect(() => { void load() }, [load])
  const saveVenue = async () => {
    if (!venue || busy) return
    if (!venue.name.trim() || !venue.address.trim()) return setError('Tên và địa chỉ cơ sở không được để trống.')
    setBusy('venue'); setError(''); setNotice('')
    try { const existingImages = Array.isArray(venue.images) ? venue.images : []; await updateManagedVenue(venueId, { name: venue.name.trim(), address: venue.address.trim(), lat: venue.lat, lng: venue.lng, amenities: venue.amenities, images: [...existingImages, ...images.filter((image) => image.status === 'uploaded').map((image) => ({ objectKey: image.objectKey }))] }); setImages([]); await load(); setNotice('Đã cập nhật cơ sở.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể cập nhật cơ sở.') }
    finally { setBusy(null) }
  }
  const addCourt = async () => {
    if (!courtName.trim() || busy) return
    setBusy('court'); setError(''); setNotice('')
    try { await addManagedCourt(venueId, courtName.trim()); setCourtName(''); await load(); setNotice('Đã thêm sân con.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể thêm sân con.') }
    finally { setBusy(null) }
  }
  const deactivate = async (courtId: string) => {
    if (!window.confirm('Xác nhận ngưng hoạt động sân này? Các booking xung đột phải được xử lý trước.')) return
    setBusy(courtId); setError(''); setNotice('')
    try { await deactivateManagedCourt(courtId); await load(); setNotice('Đã ngưng hoạt động sân con.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể ngưng sân; hãy xử lý các booking xung đột trước.') }
    finally { setBusy(null) }
  }
  if (!venue) return <p role={error ? 'alert' : undefined}>{error || 'Đang tải cơ sở...'}</p>
  return <section className="grid gap-5"><SurfaceCard className="grid gap-3"><h2 className="text-h2">Chi tiết cơ sở</h2><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Tên cơ sở<input aria-label="Tên cơ sở" value={venue.name} onChange={(event) => setVenue({ ...venue, name: event.target.value })} /></label><label className="grid gap-1 text-sm">Địa chỉ<input aria-label="Địa chỉ" value={venue.address} onChange={(event) => setVenue({ ...venue, address: event.target.value })} /></label><label className="grid gap-1 text-sm">Vĩ độ<input aria-label="Vĩ độ" value={venue.lat} onChange={(event) => setVenue({ ...venue, lat: Number(event.target.value) })} /></label><label className="grid gap-1 text-sm">Kinh độ<input aria-label="Kinh độ" value={venue.lng} onChange={(event) => setVenue({ ...venue, lng: Number(event.target.value) })} /></label></div><ImageUploadPicker label="Thêm ảnh cơ sở" authorize={authorizeVenueImage} upload={uploadVenueImage} onUploadedChange={setImages} /><Button disabled={busy !== null} onClick={() => void saveVenue()}>{busy === 'venue' ? 'Đang lưu…' : 'Lưu thay đổi'}</Button></SurfaceCard><SurfaceCard><h3 className="text-h3">Sân con</h3><div className="mt-3 flex gap-2"><input className="min-w-0 flex-1" aria-label="Tên sân con" value={courtName} onChange={(event) => setCourtName(event.target.value)} /><Button disabled={busy !== null || !courtName.trim()} onClick={() => void addCourt()}>{busy === 'court' ? 'Đang thêm…' : 'Thêm sân con'}</Button></div><div className="mt-4 grid gap-3">{venue.courts.map((court) => <article className="rounded-xl border border-line p-3" key={court.id}><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{court.name}</strong><p className="text-xs text-ink-500">Giờ mở: {court.configuration.operatingHours} · Khung giá: {court.configuration.pricingRules} · Quy tắc: {court.configuration.bookingRule ? 'Đã có' : 'Thiếu'}</p></div><div className="flex gap-2"><Link className="font-semibold" to={`/manage/venues/${venueId}/schedule?courtId=${court.id}`}>Lịch</Link><Link className="font-semibold" to={`/manage/venues/${venueId}/pricing?courtId=${court.id}`}>Giá</Link>{court.active && <Button disabled={busy !== null} size="sm" tone="secondary" onClick={() => void deactivate(court.id)}>{busy === court.id ? 'Đang xử lý…' : 'Ngưng hoạt động'}</Button>}</div></div></article>)}</div></SurfaceCard>{error && <p role="alert" className="text-sm text-danger">{error}</p>}{notice && <p role="status" className="text-sm text-green-700">{notice}</p>}</section>
}
