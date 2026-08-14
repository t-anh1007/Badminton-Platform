import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui'
import { cancelInternalBooking, createInternalBooking, getMyManagedVenues, getVenueCalendar, type ManagedVenue } from '../../lib/venueBookingApi'

type CalendarEntry = { id: string; courtId: string; kind: 'booking' | 'hold'; startAt?: string; endAt?: string }

const parseDate = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null
}

const DAY_START_MIN = 6 * 60
const DAY_END_MIN = 23 * 60
const PX_PER_MIN = 0.7

const minuteOf = (iso?: string) => {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.getUTCHours() * 60 + date.getUTCMinutes()
}
const clockLabel = (min: number) => `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`

export function ManageCalendarPage() {
  const [venues, setVenues] = useState<ManagedVenue[]>([])
  const [venueId, setVenueId] = useState('')
  const [date, setDate] = useState('')
  const [courts, setCourts] = useState<Array<{ id: string; name: string }>>([])
  const [courtId, setCourtId] = useState('')
  const [entries, setEntries] = useState<CalendarEntry[]>([])
  const [guest, setGuest] = useState({ name: '', contact: '', startAt: '', endAt: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async (id = venueId, day = parseDate(date)) => {
    if (!id || !day) return
    try {
      const result = await getVenueCalendar(id, day)
      setCourts(result.courts)
      setCourtId((current) => result.courts.some((court) => court.id === current) ? current : (result.courts[0]?.id ?? ''))
      setEntries(result.entries)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải lịch.')
    }
  }

  useEffect(() => {
    void getMyManagedVenues()
      .then((next) => {
        setVenues(next)
        setVenueId(next[0]?.id ?? '')
        setDate(new Date().toLocaleDateString('en-GB'))
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải cơ sở.'))
  }, [])

  const create = async () => {
    const day = parseDate(date)
    if (!day || !courtId || !guest.name || !guest.contact || !guest.startAt || !guest.endAt || busy) {
      setError('Chọn sân con và nhập đủ ngày dd/MM/yyyy cùng thông tin khách.')
      return
    }
    setBusy(true)
    try {
      await createInternalBooking({ courtId, startAt: guest.startAt, endAt: guest.endAt, guestName: guest.name, guestContact: guest.contact })
      setGuest({ name: '', contact: '', startAt: '', endAt: '' })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo booking nội bộ.')
    } finally {
      setBusy(false)
    }
  }

  const cancel = (id: string) => {
    setBusy(true)
    void cancelInternalBooking(id)
      .then(() => load())
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể hủy booking.'))
      .finally(() => setBusy(false))
  }

  const hourRows = useMemo(() => Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 }, (_, i) => DAY_START_MIN + i * 60), [])
  const timedByCourt = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>()
    for (const entry of entries) {
      if (minuteOf(entry.startAt) === null) continue
      const list = map.get(entry.courtId) ?? []
      list.push(entry)
      map.set(entry.courtId, list)
    }
    return map
  }, [entries])
  const untimed = entries.filter((entry) => minuteOf(entry.startAt) === null)
  const bodyHeight = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN

  const fieldClass = 'rounded-xl border border-line bg-surface px-3 py-2.5 text-sm'

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-h2">Lịch sân</h2>
        <p className="mt-1 text-sm text-ink-500">Xem kín/trống theo khung giờ và tạo booking cho khách vãng lai.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <label className="grid gap-1.5 text-sm font-medium">Cơ sở
          <select aria-label="Cơ sở" className={fieldClass} value={venueId} onChange={(event) => { setVenueId(event.target.value); void load(event.target.value) }}>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">Ngày
          <input aria-label="Ngày lịch (dd/MM/yyyy)" className={fieldClass} placeholder="dd/MM/yyyy" value={date} onChange={(event) => setDate(event.target.value)} onBlur={() => void load()} />
        </label>
      </div>

      {courts.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <div className="flex min-w-[520px]">
            <div className="w-16 shrink-0 border-r border-line">
              <div className="h-11 border-b border-line" />
              <div className="relative" style={{ height: bodyHeight }}>
                {hourRows.map((min) => (
                  <div key={min} className="absolute -translate-y-1/2 pl-2 text-[11px] text-ink-400" style={{ top: (min - DAY_START_MIN) * PX_PER_MIN }}>{clockLabel(min)}</div>
                ))}
              </div>
            </div>
            {courts.map((court) => (
              <div key={court.id} className="min-w-0 flex-1 border-r border-line last:border-r-0">
                <div className="flex h-11 items-center justify-center border-b border-line px-2 text-sm font-bold text-ink-800">{court.name}</div>
                <div className="relative" style={{ height: bodyHeight }}>
                  {hourRows.map((min) => <div key={min} className="absolute inset-x-0 border-t border-line/60" style={{ top: (min - DAY_START_MIN) * PX_PER_MIN }} />)}
                  {(timedByCourt.get(court.id) ?? []).map((entry) => {
                    const start = Math.max(minuteOf(entry.startAt)!, DAY_START_MIN)
                    const end = Math.min(minuteOf(entry.endAt) ?? start + 60, DAY_END_MIN)
                    const isBooking = entry.kind === 'booking'
                    return (
                      <div
                        key={entry.id}
                        className={`absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1 text-[11px] ${isBooking ? 'border-brand-navy/30 bg-brand-navy/10 text-brand-navy' : 'border-warning/40 bg-warning-bg text-warning'}`}
                        style={{ top: (start - DAY_START_MIN) * PX_PER_MIN, height: Math.max(18, (end - start) * PX_PER_MIN) }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-semibold">{isBooking ? 'Đã đặt' : 'Giữ chỗ'}</span>
                          {isBooking && <button type="button" disabled={busy} onClick={() => cancel(entry.id)} className="font-semibold text-danger hover:opacity-70 disabled:opacity-40">Hủy</button>}
                        </div>
                        <span className="text-ink-500">{clockLabel(start)}–{clockLabel(end)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-canvas p-4 text-sm text-ink-500">Chọn cơ sở và ngày để xem lịch.</p>
      )}

      {untimed.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {untimed.map((entry) => (
            <span key={entry.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs text-ink-600">
              {entry.kind === 'booking' ? 'Đã đặt' : 'Giữ chỗ'}
              <button type="button" disabled={busy} onClick={() => cancel(entry.id)} className="text-danger hover:opacity-70 disabled:opacity-40">Hủy</button>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h3 className="text-h3">Tạo booking vãng lai</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium">Sân con
            <select aria-label="Sân con" className={fieldClass} value={courtId} onChange={(event) => setCourtId(event.target.value)}>{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Tên khách
            <input aria-label="Tên khách" className={fieldClass} value={guest.name} onChange={(event) => setGuest({ ...guest, name: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Liên hệ khách
            <input aria-label="Liên hệ khách" className={fieldClass} value={guest.contact} onChange={(event) => setGuest({ ...guest, contact: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Bắt đầu
            <input aria-label="Bắt đầu" className={fieldClass} placeholder="2026-08-15T08:00:00Z" value={guest.startAt} onChange={(event) => setGuest({ ...guest, startAt: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Kết thúc
            <input aria-label="Kết thúc" className={fieldClass} placeholder="2026-08-15T09:00:00Z" value={guest.endAt} onChange={(event) => setGuest({ ...guest, endAt: event.target.value })} />
          </label>
        </div>
        <Button className="mt-4" disabled={busy || !courtId} onClick={() => void create()}>Tạo booking vãng lai</Button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
    </section>
  )
}
