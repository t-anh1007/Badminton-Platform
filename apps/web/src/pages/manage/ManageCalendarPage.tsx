import { useEffect, useMemo, useState } from 'react'
import { getMyManagedVenues, getVenueCalendar, type ManagedVenue } from '../../lib/venueBookingApi'
import { formatMoneyVnd } from '../../lib/formatters'

// NOTE: Tạo booking vãng lai (createInternalBooking) / hủy nội bộ (cancelInternalBooking)
// tạm ẩn khỏi trang này — tab Lịch sân hiện chỉ để XEM/quản lý. Logic API vẫn giữ
// nguyên trong venueBookingApi.ts và route backend để bật lại sau.

type Court = { courtId: string; courtName: string; closedAllDay: boolean }
type CalendarEntry = {
  id?: string
  courtId: string
  kind: 'booking' | 'hold'
  source?: 'marketplace' | 'internal'
  startAt: string
  endAt: string
  customerLabel?: string
  guestContact?: string | null
  priceSnapshot?: string
}
type DayData = { iso: string; courts: Court[]; entries: CalendarEntry[] }
type BookingRow = CalendarEntry & { iso: string }

const DEFAULT_START_MIN = 6 * 60 // khung mặc định khi không có booking
const DEFAULT_END_MIN = 22 * 60
const MIN_SPAN_MIN = 8 * 60 // luôn hiển thị tối thiểu 8 giờ cho lưới không quá ngắn
const PX_PER_MIN = 0.9
const GUTTER = 12 // đệm trên/dưới để nhãn đầu/cuối không bị header/mép cắt
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

// Co khung giờ quanh dữ liệu thực: sớm nhất − 1h … muộn nhất + 1h, snap theo giờ,
// bảo đảm nhịp tối thiểu, kẹp trong 00:00–24:00; trống thì dùng khung mặc định.
const computeRange = (entries: CalendarEntry[]) => {
  const starts = entries.map((e) => minuteOf(e.startAt)).filter((v): v is number => v !== null)
  const ends = entries.map((e) => minuteOf(e.endAt)).filter((v): v is number => v !== null)
  if (!starts.length) return { startMin: DEFAULT_START_MIN, endMin: DEFAULT_END_MIN }
  let startMin = Math.max(0, Math.floor(Math.min(...starts) / 60) * 60 - 60)
  let endMin = Math.min(24 * 60, Math.ceil(Math.max(...ends, ...starts) / 60) * 60 + 60)
  if (endMin - startMin < MIN_SPAN_MIN) {
    const grow = MIN_SPAN_MIN - (endMin - startMin)
    startMin = Math.max(0, startMin - Math.ceil(grow / 2 / 60) * 60)
    endMin = Math.min(24 * 60, startMin + MIN_SPAN_MIN)
  }
  return { startMin, endMin }
}

const isoToDate = (iso: string) => new Date(`${iso}T00:00:00Z`)
const dateToIso = (date: Date) => date.toISOString().slice(0, 10)
const todayIso = () => dateToIso(new Date())
const addDays = (iso: string, n: number) => {
  const date = isoToDate(iso)
  date.setUTCDate(date.getUTCDate() + n)
  return dateToIso(date)
}
const startOfWeek = (iso: string) => addDays(iso, -((isoToDate(iso).getUTCDay() + 6) % 7))
const fmtDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
const fmtDayLabel = (iso: string) => `${WEEKDAY_LABELS[(isoToDate(iso).getUTCDay() + 6) % 7]}, ${fmtDate(iso)}`

const minuteOf = (iso?: string) => {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.getUTCHours() * 60 + date.getUTCMinutes()
}
const clockLabel = (min: number) => `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`

// Bố cục chồng lấn kiểu Google Calendar: các block trùng giờ chia đều bề ngang.
type PlacedBlock = { entry: CalendarEntry; start: number; end: number; lane: number; lanes: number }
const layoutBlocks = (list: CalendarEntry[], startMin: number, endMin: number): PlacedBlock[] => {
  const items = list
    .map((entry) => ({ entry, start: minuteOf(entry.startAt), end: minuteOf(entry.endAt) }))
    .filter((it): it is { entry: CalendarEntry; start: number; end: number } => it.start !== null)
    .map((it) => ({ ...it, start: Math.max(it.start, startMin), end: Math.min(it.end ?? it.start + 60, endMin) }))
    .filter((it) => it.end > it.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const laneEnds: number[] = []
  const placed = items.map((it) => {
    let lane = laneEnds.findIndex((end) => end <= it.start)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.end) } else { laneEnds[lane] = it.end }
    return { ...it, lane }
  })

  // Cụm chồng lấn: số cột = số lane nhiều nhất trong cụm.
  const result: PlacedBlock[] = []
  let cluster: typeof placed = []
  let clusterEnd = -Infinity
  const flush = () => {
    if (!cluster.length) return
    const lanes = Math.max(...cluster.map((it) => it.lane)) + 1
    for (const it of cluster) result.push({ entry: it.entry, start: it.start, end: it.end, lane: it.lane, lanes })
    cluster = []
    clusterEnd = -Infinity
  }
  for (const it of placed) {
    if (cluster.length && it.start >= clusterEnd) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  flush()
  return result
}

export function ManageCalendarPage() {
  const [venues, setVenues] = useState<ManagedVenue[]>([])
  const [venueId, setVenueId] = useState('')
  const [view, setView] = useState<'day' | 'week'>('day')
  const [day, setDay] = useState(todayIso())
  const [dayData, setDayData] = useState<DayData | null>(null)
  const [weekData, setWeekData] = useState<DayData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<BookingRow | null>(null)

  useEffect(() => {
    void getMyManagedVenues()
      .then((next) => { setVenues(next); setVenueId(next[0]?.id ?? '') })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải cơ sở.'))
  }, [])

  useEffect(() => {
    if (!venueId) return
    let cancelled = false
    setLoading(true)
    setError('')
    const run = async () => {
      try {
        if (view === 'day') {
          const result = await getVenueCalendar(venueId, day)
          if (!cancelled) { setDayData({ iso: day, ...result }); setWeekData([]) }
        } else {
          const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(day), i))
          const results = await Promise.all(days.map((iso) => getVenueCalendar(venueId, iso).then((r) => ({ iso, ...r }))))
          if (!cancelled) { setWeekData(results); setDayData(null) }
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không thể tải lịch.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [venueId, day, view])

  // Chỉ hiển thị booking đã thanh toán; giữ chỗ (hold) không hiển thị.
  const allEntries = useMemo(
    () => (view === 'day' ? (dayData?.entries ?? []) : weekData.flatMap((d) => d.entries)).filter((e) => e.kind === 'booking'),
    [view, dayData, weekData],
  )
  const { startMin, endMin } = useMemo(() => computeRange(allEntries), [allEntries])
  const bodyHeight = (endMin - startMin) * PX_PER_MIN + GUTTER * 2
  const yOf = (min: number) => GUTTER + (min - startMin) * PX_PER_MIN
  const hourRows = useMemo(
    () => Array.from({ length: Math.floor((endMin - startMin) / 60) + 1 }, (_, i) => startMin + i * 60),
    [startMin, endMin],
  )

  const kpi = useMemo(() => {
    const bookings = allEntries.length
    const courts = view === 'day' ? (dayData?.courts.length ?? 0) : (weekData[0]?.courts.length ?? 0)
    let occupancy = 0
    if (view === 'day' && courts > 0 && endMin > startMin) {
      const bookedMin = allEntries.reduce((sum, e) => {
        const s = minuteOf(e.startAt), en = minuteOf(e.endAt)
        return s === null || en === null ? sum : sum + Math.max(0, Math.min(en, endMin) - Math.max(s, startMin))
      }, 0)
      occupancy = Math.round((bookedMin / (courts * (endMin - startMin))) * 100)
    }
    return { bookings, courts, occupancy }
  }, [view, dayData, weekData, allEntries, startMin, endMin])

  const shift = (n: number) => setDay((cur) => addDays(cur, view === 'day' ? n : n * 7))
  const goToday = () => setDay(startOfWeek(todayIso()) === startOfWeek(day) && view === 'week' ? day : todayIso())

  const weekStart = startOfWeek(day)
  const weekEnd = addDays(weekStart, 6)
  const navLabel = view === 'day' ? fmtDayLabel(day) : `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`
  const courtName = (id: string) => (view === 'day' ? dayData?.courts : weekData[0]?.courts)?.find((c) => c.courtId === id)?.courtName ?? ''

  // Danh sách booking (đã thanh toán) cho bảng dưới lịch, kèm ngày để phân biệt ở chế độ Tuần.
  const bookingRows = useMemo<BookingRow[]>(() => {
    const rows: BookingRow[] = view === 'day'
      ? (dayData?.entries ?? []).filter((e) => e.kind === 'booking').map((e) => ({ ...e, iso: day }))
      : weekData.flatMap((d) => d.entries.filter((e) => e.kind === 'booking').map((e) => ({ ...e, iso: d.iso })))
    return rows.sort((a, b) => (a.iso + a.startAt).localeCompare(b.iso + b.startAt))
  }, [view, dayData, weekData, day])
  const sourceLabel = (s?: string) => (s === 'internal' ? 'Tại quầy' : 'Trực tuyến')

  const timeAxis = (
    <div className="w-14 shrink-0 border-r border-line bg-surface">
      <div className="sticky top-0 z-10 h-14 border-b border-line bg-surface" />
      <div className="relative" style={{ height: bodyHeight }}>
        {hourRows.map((min) => (
          <div key={min} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-ink-400" style={{ top: yOf(min) }}>{clockLabel(min)}</div>
        ))}
      </div>
    </div>
  )

  const gridLines = hourRows.map((min) => (
    <div key={min} className="pointer-events-none absolute inset-x-0 border-t border-line/50" style={{ top: yOf(min) }} />
  ))

  const renderBlocks = (entries: CalendarEntry[], showCourt: boolean, iso: string) =>
    layoutBlocks(entries, startMin, endMin).map(({ entry, start, end, lane, lanes }, idx) => {
      const active = selected?.id && selected.id === entry.id && selected.iso === iso
      return (
        <button
          type="button"
          key={entry.id ?? `${entry.courtId}-${idx}`}
          onClick={() => setSelected({ ...entry, iso })}
          className={`absolute overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:brightness-95 ${active ? 'border-brand-navy bg-brand-navy/20 ring-2 ring-brand-navy/40' : 'border-brand-navy/25 bg-brand-navy/10'} text-brand-navy`}
          style={{
            top: yOf(start),
            height: Math.max(20, (end - start) * PX_PER_MIN - 2),
            left: `calc(${(lane / lanes) * 100}% + 2px)`,
            width: `calc(${(1 / lanes) * 100}% - 4px)`,
          }}
        >
          <span className="block font-semibold">{clockLabel(start)}–{clockLabel(end)}</span>
          <span className="block truncate text-[10px] text-ink-500">{entry.customerLabel ?? 'Đã đặt'}</span>
          {showCourt && courtName(entry.courtId) && <span className="block truncate text-[10px] text-ink-400">{courtName(entry.courtId)}</span>}
        </button>
      )
    })

  const hasData = view === 'day' ? (dayData?.courts.length ?? 0) > 0 : weekData.length > 0
  const kpiTiles: Array<{ label: string; value: string }> = view === 'day'
    ? [{ label: 'Booking', value: String(kpi.bookings) }, { label: 'Sân con', value: String(kpi.courts) }, { label: 'Lấp đầy', value: `${kpi.occupancy}%` }]
    : [{ label: 'Booking / tuần', value: String(kpi.bookings) }, { label: 'Sân con', value: String(kpi.courts) }]

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-h2">Lịch sân</h2>
        <p className="mt-1 text-sm text-ink-500">Xem kín/trống theo khung giờ, tách rõ từng sân con và số booking trong ngày.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-sm font-medium">Cơ sở
          <select aria-label="Cơ sở" className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm" value={venueId} onChange={(event) => setVenueId(event.target.value)}>
            {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
          </select>
        </label>

        <div className="inline-flex overflow-hidden rounded-xl border border-line" role="group" aria-label="Kiểu xem">
          {(['day', 'week'] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}
              className={`px-4 py-2.5 text-sm font-semibold transition ${view === mode ? 'bg-brand-navy text-white' : 'bg-surface text-ink-600 hover:bg-canvas'}`}>
              {mode === 'day' ? 'Ngày' : 'Tuần'}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-1">
          <button type="button" aria-label="Trước" onClick={() => shift(-1)} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm hover:bg-canvas">‹</button>
          <button type="button" onClick={goToday} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-medium hover:bg-canvas">Hôm nay</button>
          <button type="button" aria-label="Sau" onClick={() => shift(1)} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm hover:bg-canvas">›</button>
        </div>

        <input aria-label="Chọn ngày" type="date" className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm" value={day} onChange={(event) => event.target.value && setDay(event.target.value)} />
        <span className="ml-auto text-sm font-semibold text-ink-700">{navLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpiTiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="text-2xl font-bold tabular-nums text-ink-900">{tile.value}</div>
            <div className="text-xs text-ink-500">{tile.label}</div>
          </div>
        ))}
      </div>

      {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}

      {!hasData ? (
        <p className="rounded-xl border border-line bg-canvas p-4 text-sm text-ink-500">{loading ? 'Đang tải lịch…' : 'Chưa có dữ liệu lịch cho lựa chọn này.'}</p>
      ) : view === 'day' ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <div className="flex min-w-[560px]">
            {timeAxis}
            {(dayData?.courts ?? []).map((court) => {
              const courtEntries = (dayData?.entries ?? []).filter((e) => e.courtId === court.courtId && e.kind === 'booking')
              const count = courtEntries.length
              return (
                <div key={court.courtId} className="min-w-0 flex-1 border-r border-line last:border-r-0">
                  <div className="sticky top-0 z-10 flex h-14 flex-col items-center justify-center gap-0.5 border-b border-line bg-surface px-2">
                    <span className="truncate text-sm font-bold text-ink-800">{court.courtName}</span>
                    <span className="text-[11px] text-ink-400">{count} booking</span>
                  </div>
                  <div className="relative" style={{ height: bodyHeight }}>{gridLines}{renderBlocks(courtEntries, false, day)}</div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <div className="flex min-w-[720px]">
            {timeAxis}
            {weekData.map((d) => {
              const dayBookings = d.entries.filter((e) => e.kind === 'booking')
              const count = dayBookings.length
              const isToday = d.iso === todayIso()
              return (
                <div key={d.iso} className="min-w-0 flex-1 border-r border-line last:border-r-0">
                  <div className={`sticky top-0 z-10 flex h-14 flex-col items-center justify-center gap-0.5 border-b border-line px-2 ${isToday ? 'bg-brand-yellow/20' : 'bg-surface'}`}>
                    <span className="text-sm font-bold text-ink-800">{fmtDayLabel(d.iso).split(',')[0]}</span>
                    <span className="text-[11px] text-ink-400">{fmtDate(d.iso).slice(0, 5)} · {count} booking</span>
                  </div>
                  <div className={`relative ${isToday ? 'bg-brand-yellow/5' : ''}`} style={{ height: bodyHeight }}>{gridLines}{renderBlocks(dayBookings, true, d.iso)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {hasData && (
        <div className="rounded-2xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-bold text-ink-800">Danh sách booking {view === 'day' ? 'trong ngày' : 'trong tuần'}</h3>
            <span className="text-xs text-ink-500">{bookingRows.length} booking</span>
          </div>
          {bookingRows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-500">Chưa có booking nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-500">
                    {view === 'week' && <th className="px-4 py-2 font-medium">Ngày</th>}
                    <th className="px-4 py-2 font-medium">Khung giờ</th>
                    <th className="px-4 py-2 font-medium">Sân</th>
                    <th className="px-4 py-2 font-medium">Khách</th>
                    <th className="px-4 py-2 font-medium">Nguồn</th>
                    <th className="px-4 py-2 text-right font-medium">Giá</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {bookingRows.map((row, idx) => (
                    <tr key={row.id ?? `${row.iso}-${row.courtId}-${idx}`} className="border-b border-line/60 last:border-b-0">
                      {view === 'week' && <td className="px-4 py-2.5 whitespace-nowrap text-ink-600">{fmtDate(row.iso)}</td>}
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-ink-700">{clockLabel(minuteOf(row.startAt) ?? 0)}–{clockLabel(minuteOf(row.endAt) ?? 0)}</td>
                      <td className="px-4 py-2.5 text-ink-700">{courtName(row.courtId)}</td>
                      <td className="px-4 py-2.5 text-ink-700">{row.customerLabel ?? '—'}</td>
                      <td className="px-4 py-2.5 text-ink-600">{sourceLabel(row.source)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-800">{row.priceSnapshot ? formatMoneyVnd(row.priceSnapshot) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button type="button" onClick={() => setSelected(row)} className="text-xs font-semibold text-brand-navy hover:underline">Chi tiết</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Chi tiết booking">
          <div className="absolute inset-0 bg-ink-900/30" onClick={() => setSelected(null)} />
          <aside className="relative flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto bg-surface p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <h3 className="text-h3">Chi tiết booking</h3>
              <button type="button" aria-label="Đóng" onClick={() => setSelected(null)} className="rounded-lg px-2 py-1 text-ink-500 hover:bg-canvas">✕</button>
            </div>
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Ngày</dt><dd className="font-medium text-ink-800">{fmtDate(selected.iso)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Khung giờ</dt><dd className="font-medium tabular-nums text-ink-800">{clockLabel(minuteOf(selected.startAt) ?? 0)}–{clockLabel(minuteOf(selected.endAt) ?? 0)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Sân con</dt><dd className="font-medium text-ink-800">{courtName(selected.courtId)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Khách</dt><dd className="font-medium text-ink-800">{selected.customerLabel ?? '—'}</dd></div>
              {selected.guestContact && <div className="flex justify-between gap-4"><dt className="text-ink-500">Liên hệ</dt><dd className="font-medium text-ink-800">{selected.guestContact}</dd></div>}
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Nguồn</dt><dd className="font-medium text-ink-800">{sourceLabel(selected.source)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Giá</dt><dd className="font-bold text-ink-900">{selected.priceSnapshot ? formatMoneyVnd(selected.priceSnapshot) : '—'}</dd></div>
            </dl>
            <p className="mt-auto text-xs text-ink-400">Thao tác đổi sân / hủy booking sẽ bổ sung ở bước sau.</p>
          </aside>
        </div>
      )}
    </section>
  )
}
