import { useEffect, useMemo, useState } from 'react'
import { getMyManagedVenues, getVenueCalendar, type ManagedVenue } from '../../lib/venueBookingApi'
import { vietnamDateInput, vietnamMinuteOfDay } from '../../lib/formatters'
import { Icon } from '../../components/Icon'
import { SegmentedControl, SelectInput } from '../../components/ui'

// NOTE: Tạo booking vãng lai (createInternalBooking) / hủy nội bộ (cancelInternalBooking)
// tạm ẩn khỏi trang này — tab Lịch sân hiện chỉ để XEM/quản lý. Logic API vẫn giữ
// nguyên trong venueBookingApi.ts và route backend để bật lại sau.

type Court = { courtId: string; courtName: string; closedAllDay: boolean; closedRanges?: Array<{ startMinute: number; endMinute: number }> }
type CalendarEntry = {
  businessCode?: string
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
const todayIso = () => vietnamDateInput(new Date())
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
  return vietnamMinuteOfDay(date)
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

/** Lịch theo ngày/tuần của một cơ sở; bấm lượt đặt → onSelect mở drawer chi tiết dùng chung. */
export function ManageCalendarPage({ onSelect }: { onSelect?: (bookingId: string) => void }) {
  const [venues, setVenues] = useState<ManagedVenue[]>([])
  const [venueId, setVenueId] = useState('')
  const [view, setView] = useState<'day' | 'week'>('day')
  const [day, setDay] = useState(todayIso())
  const [dayData, setDayData] = useState<DayData | null>(null)
  const [weekData, setWeekData] = useState<DayData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  const renderBlocks = (entries: CalendarEntry[], showCourt: boolean) =>
    layoutBlocks(entries, startMin, endMin).map(({ entry, start, end, lane, lanes }, idx) => {
      return (
        <button
          type="button"
          key={entry.id ?? `${entry.courtId}-${idx}`}
          disabled={!entry.id}
          onClick={() => entry.id && onSelect?.(entry.id)}
          className={`absolute overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:brightness-95 border-brand-navy/25 bg-brand-navy/10 text-brand-navy`}
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
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SelectInput aria-label="Cơ sở" className="!w-64" value={venueId} onChange={(event) => setVenueId(event.target.value)}>
          {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
        </SelectInput>
        <SegmentedControl options={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }]} value={view} onChange={setView} />
        <button type="button" aria-label="Trước" onClick={() => shift(-1)} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface hover:border-brand-navy"><Icon name="chevronLeft" className="h-4 w-4" /></button>
        <span className="min-w-36 text-center text-sm font-bold text-ink-900">{navLabel}</span>
        <button type="button" aria-label="Sau" onClick={() => shift(1)} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface hover:border-brand-navy"><Icon name="chevronRight" className="h-4 w-4" /></button>
        <button type="button" onClick={goToday} className="min-h-9 rounded-full border border-line bg-surface px-4 text-sm font-semibold hover:border-brand-navy">{view === 'day' ? 'Hôm nay' : 'Tuần này'}</button>
        <span className="ml-auto text-sm text-ink-500">{kpi.bookings} lượt{view === 'day' ? ` · lấp đầy ${kpi.occupancy}%` : ''}</span>
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
                    <span className="text-[11px] text-ink-400">{court.closedAllDay ? 'Đóng cả ngày' : `${count} booking`}</span>
                  </div>
                  <div className={`relative ${court.closedAllDay ? 'bg-ink-900/5' : ''}`} style={{ height: bodyHeight }}>{gridLines}{court.closedAllDay && <div className="absolute inset-x-0 top-1/3 text-center text-xs font-semibold text-ink-500">Sân đóng cửa</div>}{!court.closedAllDay && (court.closedRanges ?? []).map((r) => { const a = Math.max(r.startMinute, startMin); const b = Math.min(r.endMinute, endMin); return b > a ? <div key={r.startMinute} className="pointer-events-none absolute inset-x-0 flex items-start justify-center bg-ink-900/10 pt-1 text-[11px] font-semibold text-ink-500" style={{ top: yOf(a), height: (b - a) * PX_PER_MIN }}>Đã khóa {clockLabel(r.startMinute)}–{clockLabel(r.endMinute)}</div> : null })}{renderBlocks(courtEntries, false)}</div>
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
              const closedCount = d.courts.filter((c) => c.closedAllDay).length
              return (
                <div key={d.iso} className="min-w-0 flex-1 border-r border-line last:border-r-0">
                  <div className={`sticky top-0 z-10 flex h-14 flex-col items-center justify-center gap-0.5 border-b border-line px-2 ${isToday ? 'bg-brand-yellow/20' : 'bg-surface'}`}>
                    <span className="text-sm font-bold text-ink-800">{fmtDayLabel(d.iso).split(',')[0]}</span>
                    <span className="text-[11px] text-ink-400">{fmtDate(d.iso).slice(0, 5)} · {count} booking</span>
                    {closedCount > 0 && <span className="text-[10px] font-semibold text-danger">{closedCount === d.courts.length ? 'Đóng cả ngày' : `${closedCount} sân đóng`}</span>}
                  </div>
                  <div className={`relative ${isToday ? 'bg-brand-yellow/5' : ''}`} style={{ height: bodyHeight }}>{gridLines}{renderBlocks(dayBookings, true)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </section>
  )
}
