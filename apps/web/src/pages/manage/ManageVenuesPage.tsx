import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, SurfaceCard } from '../../components/ui'
import { createManagedVenue, getMyManagedVenues, type ManagedVenue } from '../../lib/venueBookingApi'

interface VenueForm { name: string; address: string; lat: string; lng: string; amenities: string }
const emptyForm: VenueForm = { name: '', address: '', lat: '', lng: '', amenities: '' }

export function ManageVenuesPage() {
  const [venues, setVenues] = useState<ManagedVenue[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof VenueForm, string>>>({})
  const [form, setForm] = useState<VenueForm>(emptyForm)
  const load = useCallback(async () => { try { setVenues(await getMyManagedVenues()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách cơ sở.') } }, [])
  useEffect(() => { void load() }, [load])

  const change = (key: keyof VenueForm, value: string) => { setForm((current) => ({ ...current, [key]: value })); setFieldErrors((current) => ({ ...current, [key]: undefined })) }
  const submit = async () => {
    if (busy) return
    const nextErrors: typeof fieldErrors = {}
    const lat = Number(form.lat); const lng = Number(form.lng)
    if (!form.name.trim()) nextErrors.name = 'Vui lòng nhập tên cơ sở.'
    if (!form.address.trim()) nextErrors.address = 'Vui lòng nhập địa chỉ.'
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) nextErrors.lat = 'Vĩ độ phải từ -90 đến 90.'
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) nextErrors.lng = 'Kinh độ phải từ -180 đến 180.'
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); return }
    setBusy(true); setError('')
    try {
      await createManagedVenue({ name: form.name.trim(), address: form.address.trim(), lat, lng, amenities: form.amenities.split(',').map((item) => item.trim()).filter(Boolean), images: [] })
      setOpen(false); setForm(emptyForm); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể lưu cơ sở.') }
    finally { setBusy(false) }
  }

  const formControl = open && <SurfaceCard className="mt-4 grid gap-3">
    <h3 className="text-h3">Thông tin cơ sở</h3>
    {(['name', 'address', 'lat', 'lng', 'amenities'] as const).map((key) => <label key={key} className="grid gap-1 text-sm font-medium">{{ name: 'Tên cơ sở', address: 'Địa chỉ', lat: 'Vĩ độ', lng: 'Kinh độ', amenities: 'Tiện ích (phân cách bằng dấu phẩy)' }[key]}<input aria-label={{ name: 'Tên cơ sở', address: 'Địa chỉ', lat: 'Vĩ độ', lng: 'Kinh độ', amenities: 'Tiện ích' }[key]} value={form[key]} onChange={(event) => change(key, event.target.value)} className="rounded-xl border border-line px-3 py-2" />{fieldErrors[key] && <span className="text-xs text-danger">{fieldErrors[key]}</span>}</label>)}
    <div className="flex gap-2"><Button disabled={busy} onClick={() => void submit()}>{busy ? 'Đang lưu…' : 'Lưu cơ sở'}</Button><Button tone="secondary" disabled={busy} onClick={() => setOpen(false)}>Hủy</Button></div>
  </SurfaceCard>

  return <section><div className="flex items-center justify-between gap-3"><div><h2 className="text-h2">Cơ sở kinh doanh</h2><p className="mt-1 text-sm text-ink-500">Quản lý địa điểm, sân con và mức độ hoàn thiện cấu hình.</p></div>{venues.length > 0 && <Button onClick={() => setOpen(true)}>Thêm sân kinh doanh</Button>}</div>{error && <p role="alert" className="mt-3 text-danger">{error}</p>}{formControl}{venues.length === 0 && !open ? <EmptyState title="Chưa có cơ sở" description="Bắt đầu thêm sân kinh doanh." action={<Button onClick={() => setOpen(true)}>Thêm sân kinh doanh</Button>} /> : <div className="mt-5 grid gap-3 md:grid-cols-2">{venues.map((venue) => <Link key={venue.id} to={`/manage/venues/${venue.id}`} className="rounded-xl border border-line bg-surface p-4"><strong>{venue.name}</strong><p className="mt-1 text-sm text-ink-500">{venue.address} · {venue.courts.length} sân con</p></Link>)}</div>}</section>
}
