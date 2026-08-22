import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { toggleSlot, type BookingRange } from '../booking/selection.js'
import { AuthForm } from '../components/AuthForm'
import { BookingSummary as BookingSelectionSummary } from '../components/BookingSummary.js'
import { SlotGrid, type Slot, type SlotStatus } from '../components/SlotGrid'
import { PageHeader } from '../components/courtin/PageHeader'
import { Button, EmptyState, Modal, Skeleton, SurfaceCard } from '../components/ui'
import { BookingPaymentPanel } from '../components/BookingPaymentPanel.js'
import {
  createBooking,
  createHold,
  getCourtAvailability,
  getVenueDetail,
  selectSlot,
  type BookingSummary,
  type HoldResult,
  type VenueDetail,
} from '../lib/venueBookingApi'

function isAuthenticationFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /401|unauthori[sz]ed|đăng nhập|token|xác thực/i.test(message)
}

function formatDateField(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function parseDateField(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return null
  const [, day, month, year] = match
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`)
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return null
  return `${year}-${month}-${day}`
}

const vietnamClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function getVietnamClock(now = new Date()): { date: string; minute: number } {
  const parts = Object.fromEntries(vietnamClock.formatToParts(now).map((part) => [part.type, part.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function isPastSlot(date: string, startMinute: number, now = new Date()): boolean {
  const current = getVietnamClock(now)
  return date < current.date || (date === current.date && startMinute <= current.minute)
}

function HoldCountdown({ expiresAt, onExpired }: { expiresAt?: string; onExpired: () => void }) {
  const [remaining, setRemaining] = useState(0)
  const onExpiredRef = useRef(onExpired)
  useEffect(() => { onExpiredRef.current = onExpired }, [onExpired])
  useEffect(() => {
    if (!expiresAt) return
    const deadline = new Date(expiresAt).getTime()
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()))
    tick()
    const interval = window.setInterval(tick, 1_000)
    const timeout = window.setTimeout(() => onExpiredRef.current(), Math.max(0, deadline - Date.now()))
    return () => { window.clearInterval(interval); window.clearTimeout(timeout) }
  }, [expiresAt])
  if (!expiresAt) return null
  return <span className={`text-figures rounded-full px-3 py-2 text-sm ${remaining < 120_000 ? 'bg-danger-bg text-danger' : 'bg-brand-yellow text-brand-navy'}`}>Giữ chỗ {Math.floor(remaining / 60_000).toString().padStart(2, '0')}:{Math.floor((remaining % 60_000) / 1_000).toString().padStart(2, '0')}</span>
}

export function BookingPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const venueId = params.get('venueId')
  const [detail, setDetail] = useState<VenueDetail | null>(null)
  const [courtId, setCourtId] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [selection, setSelection] = useState<BookingRange | null>(null)
  const [hold, setHold] = useState<HoldResult | null>(null)
  const [booking, setBooking] = useState<BookingSummary | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  const [error, setError] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const retryAfterAuth = useRef<(() => void) | null>(null)
  const availabilityRequestId = useRef(0)
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
  const [dateField, setDateField] = useState(() => formatDateField(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)))

  const step = booking ? 3 : hold ? 2 : 1
  const selectedCourt = detail?.courts.find((court) => court.id === courtId)
  const selectedCourtName = selectedCourt?.name ?? 'Sân'
  const bookingRule = selectedCourt?.bookingRule ?? null
  const meetsMinDuration = !bookingRule || !selection || selection.durationMinutes >= bookingRule.minDurationMinutes

  const clearFlow = () => {
    setSelection(null)
    setHold(null)
    setBooking(null)
  }

  const loadAvailability = async (nextCourtId: string, nextDate: string) => {
    const requestId = ++availabilityRequestId.current
    setAvailabilityLoading(true)
    setError('')
    setSlots([])
    try {
      const schedule = await getCourtAvailability(nextCourtId, nextDate)
      if (requestId !== availabilityRequestId.current) return
      setSlots(schedule.slots.map((slot) => {
        const start = new Date(`${nextDate}T00:00:00.000Z`)
        start.setUTCMinutes(slot.startMinute)
        const past = isPastSlot(nextDate, slot.startMinute)
        return {
          time: `${Math.floor(slot.startMinute / 60).toString().padStart(2, '0')}:${(slot.startMinute % 60).toString().padStart(2, '0')}`,
          endTime: `${Math.floor(slot.endMinute / 60).toString().padStart(2, '0')}:${(slot.endMinute % 60).toString().padStart(2, '0')}`,
          status: past ? 'past' : slot.available ? 'available' : 'unavailable',
          price: Number(slot.price ?? 0),
          selection: {
            courtId: nextCourtId,
            date: nextDate,
            startAt: start.toISOString(),
            endMinute: slot.endMinute,
            available: slot.available && !past,
            price: slot.price ?? '0',
          },
        }
      }))
      setMessage(schedule.closed ? 'Sân đóng cửa vào ngày đã chọn.' : '')
    } catch (caught) {
      if (requestId !== availabilityRequestId.current) return
      setError(caught instanceof Error ? caught.message : 'Không thể tải lịch sân.')
    } finally {
      if (requestId === availabilityRequestId.current) setAvailabilityLoading(false)
    }
  }

  useEffect(() => {
    if (!venueId) return
    getVenueDetail(venueId).then((venue) => {
      const firstCourt = venue.courts[0]
      if (!firstCourt) throw new Error('Cơ sở chưa có sân hoạt động.')
      setDetail(venue)
      setCourtId(firstCourt.id)
      return loadAvailability(firstCourt.id, date)
    }).catch((caught: Error) => { setError(caught.message); setAvailabilityLoading(false) })
  }, [venueId])

  const renderedSlots = useMemo(() => slots.map((slot) => ({
    ...slot,
    selected: Boolean(selection && slot.selection && selection.courtId === slot.selection.courtId && selection.date === slot.selection.date && slot.selection.startAt >= selection.startAt && slot.selection.startAt < selection.endAt),
  })), [selection, slots])

  if (!venueId) return <Navigate to="/venues" replace />

  const updateSelectedSlots = (status: SlotStatus) => {
    if (!selection) return
    setSlots((current) => current.map((slot) => slot.selection && slot.selection.startAt >= selection.startAt && slot.selection.startAt < selection.endAt ? { ...slot, status } : slot))
  }

  const run = async (action: () => Promise<void>) => {
    setLoading(true)
    setError('')
    try {
      await action()
    } catch (caught) {
      if (isAuthenticationFailure(caught)) {
        retryAfterAuth.current = () => { void run(action) }
        setMessage('Đăng nhập để tiếp tục đặt sân.')
        setAuthOpen(true)
      } else {
        setError(caught instanceof Error ? caught.message : 'Không thể xử lý yêu cầu.')
      }
    } finally {
      setLoading(false)
    }
  }

  const choose = (slot: Slot) => {
    if (!slot.selection || slot.status !== 'available' || isPastSlot(slot.selection.date, Number(slot.time.slice(0, 2)) * 60 + Number(slot.time.slice(3, 5)))) return
    const availableSlots = slots.flatMap((item) => item.selection ? [item.selection] : [])
    const proposed = toggleSlot(selection, slot.selection, availableSlots)
    if (proposed === selection) {
      setMessage('Chỉ có thể chọn các khung giờ trống liền nhau trên cùng một sân.')
      return
    }
    if (!proposed) {
      clearFlow()
      setMessage('Đã bỏ chọn khung giờ.')
      return
    }
    // BR-VEN-10: quá thời lượng tối đa — chặn tại client, giữ lựa chọn hiện tại.
    if (bookingRule && proposed.durationMinutes > bookingRule.maxDurationMinutes) {
      setMessage(`Mỗi lượt đặt tối đa ${bookingRule.maxDurationMinutes} phút. Hãy bỏ bớt một khung giờ.`)
      return
    }
    // Chưa đạt thời lượng tối thiểu — hiển thị tạm bằng giá tính phía client,
    // chưa gọi select-slot (server sẽ báo INVALID_DURATION nếu gọi sớm).
    if (bookingRule && proposed.durationMinutes < bookingRule.minDurationMinutes) {
      setSelection(proposed)
      setHold(null)
      setBooking(null)
      const missingSlots = Math.ceil((bookingRule.minDurationMinutes - proposed.durationMinutes) / bookingRule.stepMinutes)
      setMessage(`Chọn thêm ${missingSlots} khung giờ liền nhau (tối thiểu ${bookingRule.minDurationMinutes} phút) để tiếp tục.`)
      return
    }
    void run(async () => {
      const validated = await selectSlot(proposed.courtId, { startAt: proposed.startAt, durationMinutes: proposed.durationMinutes })
      setSelection({ ...proposed, startAt: validated.startAt, endAt: validated.endAt, durationMinutes: validated.durationMinutes, totalPrice: validated.totalPrice })
      setHold(null)
      setBooking(null)
      setMessage(`Đã chọn ${proposed.slotCount} khung giờ liền nhau.`)
    })
  }

  const changeDate = (nextDate: string) => {
    setDate(nextDate)
    setDateField(formatDateField(nextDate))
    clearFlow()
    if (courtId) void loadAvailability(courtId, nextDate)
  }

  const confirm = () => run(async () => {
    if (!selection) return
    const nextHold = await createHold({ courtId: selection.courtId, startAt: selection.startAt, endAt: selection.endAt })
    setHold(nextHold)
    updateSelectedSlots('held')
    const next = await createBooking(nextHold.id)
    setBooking(next)
    setMessage('Hoàn tất thanh toán trước khi lượt giữ chỗ hết hạn.')
  })

  const expireHold = () => {
    if (!hold) return
    clearFlow()
    setMessage('Hết thời gian giữ chỗ, hãy chọn lại slot.')
    if (courtId) void loadAvailability(courtId, date)
  }

  return (
    <main className="page-container py-8 sm:py-12">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader eyebrow="Đặt sân" title={detail?.name ?? 'Đang tải cơ sở…'} description={detail?.address} />
        <HoldCountdown expiresAt={hold?.expiresAt} onExpired={expireHold} />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {['Chọn slot', 'Xác nhận', 'Thanh toán'].map((label, index) => <span key={label} className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[.04em] ${step === index + 1 ? 'bg-brand-navy text-surface' : 'border border-line bg-surface text-ink-500'}`}>{index + 1}. {label}</span>)}
      </div>
      {error && <SurfaceCard className="mb-5 border-danger bg-danger-bg"><p role="alert" className="text-danger">{error}</p><Link to="/venues" className="mt-2 inline-block text-sm font-semibold text-green-700 hover:underline">Quay lại danh sách sân</Link></SurfaceCard>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <SurfaceCard>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Ngày
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Ngày đặt sân (dd/mm/yyyy)"
                    placeholder="dd/mm/yyyy"
                    value={dateField}
                    onChange={(event) => {
                      const nextField = event.target.value.replace(/[^\d/]/g, '').slice(0, 10)
                      setDateField(nextField)
                      const nextDate = parseDateField(nextField)
                      if (nextDate && nextDate !== date) changeDate(nextDate)
                    }}
                    onBlur={() => { if (!parseDateField(dateField)) { setDateField(formatDateField(date)); setError('Ngày phải theo định dạng dd/mm/yyyy.') } }}
                    disabled={Boolean(booking)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 pr-11"
                  />
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-500">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                  </span>
                  <input
                    type="date"
                    aria-label="Chọn ngày từ lịch"
                    value={date}
                    min={getVietnamClock().date}
                    disabled={Boolean(booking)}
                    onChange={(event) => { if (event.target.value && event.target.value !== date) changeDate(event.target.value) }}
                    className="absolute inset-y-0 right-0 w-11 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  />
                </div>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Sân con
                <select disabled={Boolean(booking)} value={courtId} onChange={(event) => { const nextCourtId = event.target.value; setCourtId(nextCourtId); clearFlow(); void loadAvailability(nextCourtId, date) }} className="rounded-xl border border-line bg-surface px-3 py-2.5">
                  {detail?.courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
                </select>
              </label>
            </div>
            {selectedCourt?.images?.length ? (
              <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2" aria-label={`Ảnh ${selectedCourtName}`}>
                {selectedCourt.images.map((src, index) => <img key={src} src={src} alt={`${selectedCourtName} ${index + 1}`} className="h-36 w-56 shrink-0 snap-start rounded-xl object-cover" />)}
              </div>
            ) : null}
            {availabilityLoading ? (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-20" />)}</div>
            ) : slots.length ? (
              <div className="mt-5"><SlotGrid courtName={selectedCourtName} slots={renderedSlots} onSelect={booking ? undefined : choose} /></div>
            ) : (
              <div className="mt-5"><EmptyState title="Không còn slot trống" description="Hãy chọn ngày hoặc sân con khác." /></div>
            )}
          </SurfaceCard>
        </section>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <SurfaceCard>
            <h2 className="text-h3">Tóm tắt đặt sân</h2>
            {selection ? <BookingSelectionSummary venue={detail?.name ?? 'Cơ sở'} court={selectedCourtName} range={selection} /> : <p className="mt-3 text-sm text-ink-500">Chọn một hoặc nhiều khung giờ trống liền nhau để xem tổng tiền.</p>}
            {selection && !booking && (meetsMinDuration
              ? <Button className="mt-5 w-full" disabled={loading} onClick={() => void confirm()}>XÁC NHẬN</Button>
              : <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Cần chọn tối thiểu {bookingRule?.minDurationMinutes} phút để xác nhận đặt sân.</p>)}
            {booking && hold && <BookingPaymentPanel bookingId={booking.id} holdExpiresAt={hold.expiresAt} onRecover={expireHold} onConfirmed={(detail) => { updateSelectedSlots('booked'); navigate('/booking/confirmation', { state: { booking: detail.booking } }) }} />}
            {message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}
          </SurfaceCard>
        </aside>
      </div>
      <Modal open={authOpen} title="Đăng nhập để đặt sân" onClose={() => setAuthOpen(false)}><AuthForm onNavigateAway={() => setAuthOpen(false)} onAuthenticated={() => { setAuthOpen(false); const retry = retryAfterAuth.current; retryAfterAuth.current = null; retry?.() }} /></Modal>
    </main>
  )
}
