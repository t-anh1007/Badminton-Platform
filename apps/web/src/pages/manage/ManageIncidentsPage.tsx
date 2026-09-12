import { useEffect, useState } from 'react'
import { Badge, Button, SelectInput, SurfaceCard, TextArea } from '../../components/ui'
import {
  cancelProviderBooking,
  changeBookingCourt,
  getMyManagedVenues,
  getReplacementCourts,
  getVenueCalendar,
  type ManagedVenue,
} from '../../lib/venueBookingApi'
import { formatTimeVi } from '../../lib/formatters'

type IncidentBooking = {
  id: string
  courtId: string
  kind: 'booking' | 'hold'
  startAt: string
  endAt: string
}

const toIsoDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null
}

const todayInputValue = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function ManageIncidentsPage() {
  const [venues, setVenues] = useState<ManagedVenue[]>([])
  const [venueId, setVenueId] = useState('')
  const [date, setDate] = useState(todayInputValue)
  const [bookings, setBookings] = useState<IncidentBooking[]>([])
  const [bookingId, setBookingId] = useState('')
  const [courts, setCourts] = useState<Array<{ id: string; name: string }>>([])
  const [courtId, setCourtId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [resolution, setResolution] = useState<'replace' | 'cancel' | ''>('')

  const loadBookings = async (nextVenueId = venueId, nextDate = toIsoDate(date)) => {
    if (!nextVenueId || !nextDate) {
      setError('Ngày phải theo định dạng dd/MM/yyyy.')
      return
    }
    try {
      const result = await getVenueCalendar(nextVenueId, nextDate)
      const ownedBookings = result.entries.filter(
        (entry): entry is typeof entry & { id: string } => entry.kind === 'booking' && typeof entry.id === 'string',
      )
      setBookings(ownedBookings)
      setBookingId(ownedBookings[0]?.id ?? '')
      setCourts([])
      setCourtId('')
      setResolution('')
      setStep(1)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải booking của cơ sở.')
    }
  }

  useEffect(() => {
    void getMyManagedVenues()
      .then((next) => {
        setVenues(next)
        const firstVenueId = next[0]?.id ?? ''
        setVenueId(firstVenueId)
        return loadBookings(firstVenueId, toIsoDate(date))
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải cơ sở.'))
  }, [])

  const loadReplacementCourts = async () => {
    if (!bookingId) return
    try {
      const result = await getReplacementCourts(bookingId)
      setCourts(result.courts)
      setCourtId(result.courts[0]?.id ?? '')
      setResolution('replace')
      setStep(2)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải sân thay thế.')
    }
  }

  const chooseCancellation = () => {
    setResolution('cancel')
    setStep(2)
  }

  const selectedBooking = bookings.find((booking) => booking.id === bookingId)
  const selectedCourt = courts.find((court) => court.id === courtId)
  const canContinue = resolution === 'replace' ? Boolean(courtId) : Boolean(reason.trim())

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
      await loadBookings()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xử lý sự cố.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="grid gap-6">
    <header><p className="courtin-kicker">ĐIỀU HÀNH BOOKING</p><h2 className="mt-1 text-h1">Xử lý sự cố booking</h2><p className="mt-1 text-sm text-ink-500">Chuyển khách sang sân cùng cơ sở hoặc hủy và hoàn đủ tiền khi không thể tiếp tục.</p></header>
    <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Tiến trình xử lý sự cố">
      {(['Chọn booking', 'Chọn phương án', 'Xác nhận'] as const).map((label, index) => <li key={label} className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[.04em] ${step === index + 1 ? 'bg-brand-navy text-surface' : 'border border-line bg-surface text-ink-500'}`}><span className="mr-1.5">{index + 1}.</span>{label}</li>)}
    </ol>
    <SurfaceCard>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-h3">1. Chọn booking bị ảnh hưởng</h3><p className="mt-1 text-sm text-ink-500">Chỉ hiển thị các booking thuộc cơ sở bạn quản lý trong ngày đã chọn.</p></div>{selectedBooking && <Badge tone="warning">Đang chọn</Badge>}</div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-semibold text-ink-700">Cơ sở<SelectInput value={venueId} onChange={(event) => { setVenueId(event.target.value); void loadBookings(event.target.value) }}>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</SelectInput></label><label className="grid gap-1.5 text-sm font-semibold text-ink-700">Ngày<input type="date" aria-label="Ngày sự cố" className="w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2.5 text-ink-900 transition focus:border-brand-navy focus:ring-4 focus:ring-green-100" value={date} onChange={(event) => { setDate(event.target.value); void loadBookings(venueId, toIsoDate(event.target.value)) }} /></label></div>
      <label className="mt-3 grid gap-1.5 text-sm font-semibold text-ink-700">Booking<SelectInput aria-label="Booking đã chọn" value={bookingId} onChange={(event) => { setBookingId(event.target.value); setCourts([]); setCourtId(''); setResolution(''); setStep(1) }}><option value="">Chưa chọn booking</option>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{formatTimeVi(booking.startAt)}–{formatTimeVi(booking.endAt)}</option>)}</SelectInput></label>
      {selectedBooking && <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-canvas p-4 text-sm"><span className="text-figures text-lg font-bold text-brand-navy">{formatTimeVi(selectedBooking.startAt)}–{formatTimeVi(selectedBooking.endAt)}</span><span className="text-ink-500">Booking đã xác nhận · Sân bị ảnh hưởng</span></div>}
      <div className="mt-5 flex flex-wrap gap-2"><Button disabled={!bookingId || busy} onClick={() => void loadReplacementCourts()}>Tải sân thay thế</Button><Button tone="secondary" disabled={!bookingId || busy} onClick={chooseCancellation}>Hủy do lỗi phía sân</Button></div>
    </SurfaceCard>
    {step >= 2 && <SurfaceCard>
      <div><h3 className="text-h3">2. Chọn phương án xử lý</h3><p className="mt-1 text-sm text-ink-500">{resolution === 'replace' ? 'Chỉ có các sân trống trọn khung giờ booking được liệt kê.' : 'Hủy do phía sân sẽ hoàn đủ tiền cho người chơi.'}</p></div>
      {resolution === 'replace' ? <><label className="mt-5 grid gap-1.5 text-sm font-semibold text-ink-700">Sân thay thế<SelectInput aria-label="Sân thay thế" value={courtId} onChange={(event) => setCourtId(event.target.value)}>{courts.length ? courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>) : <option value="">Không có sân thay thế</option>}</SelectInput></label>{courts.length === 0 && <p className="mt-3 rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning">Không tìm thấy sân trống. Bạn có thể hủy booking và hoàn đủ tiền.</p>}</> : <label className="mt-5 grid gap-1.5 text-sm font-semibold text-ink-700">Lý do lỗi phía sân<TextArea aria-label="Lý do lỗi phía sân" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ví dụ: sân hư đèn và không thể khắc phục kịp thời." /></label>}
      <div className="mt-5 flex justify-end"><Button disabled={!canContinue || busy} onClick={() => setStep(3)}>Tiếp tục</Button></div>
    </SurfaceCard>}
    {step === 3 && <SurfaceCard>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-h3">3. Xác nhận phương án</h3><p className="mt-1 text-sm text-ink-500">Kiểm tra lại thông tin trước khi hệ thống cập nhật booking và thông báo cho người chơi.</p></div><Badge tone={resolution === 'replace' ? 'success' : 'danger'}>{resolution === 'replace' ? 'Đổi sân' : 'Hủy & hoàn tiền'}</Badge></div>
      <dl className="mt-5 grid gap-3 rounded-xl bg-canvas p-4 text-sm sm:grid-cols-2"><div><dt className="text-caption">Booking</dt><dd className="mt-1 font-bold text-ink-900">{selectedBooking ? `${formatTimeVi(selectedBooking.startAt)}–${formatTimeVi(selectedBooking.endAt)}` : '—'}</dd></div><div><dt className="text-caption">Phương án</dt><dd className="mt-1 font-bold text-ink-900">{resolution === 'replace' ? `Chuyển sang ${selectedCourt?.name ?? 'sân đã chọn'}` : 'Hủy và hoàn đủ tiền'}</dd></div>{resolution === 'cancel' && <div className="sm:col-span-2"><dt className="text-caption">Lý do</dt><dd className="mt-1 text-ink-700">{reason}</dd></div>}</dl>
      <div className="mt-5 flex flex-wrap justify-end gap-2"><Button tone="secondary" disabled={busy} onClick={() => setStep(2)}>Quay lại</Button>{resolution === 'replace' ? <Button disabled={busy || !bookingId || !courtId} onClick={() => void run(() => changeBookingCourt(bookingId, courtId))}>Xác nhận đổi sân</Button> : <Button tone="danger" disabled={busy || !bookingId || !reason.trim()} onClick={() => void run(() => cancelProviderBooking(bookingId, reason.trim()))}>Xác nhận hủy booking</Button>}</div>
    </SurfaceCard>}
    {error && <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>}
  </section>
}
