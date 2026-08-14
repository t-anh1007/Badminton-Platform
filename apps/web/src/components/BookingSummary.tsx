import type { BookingRange } from '../booking/selection.js'
import { formatDateVi, formatDuration, formatMoneyVnd } from '../lib/formatters.js'

const formatTimeVi = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))

export function BookingSummary({ venue, court, range }: { venue: string; court: string; range: BookingRange }) {
  return <div className="mt-4 space-y-2 text-sm text-ink-500"><p>{venue} · {court}</p><p>{formatDateVi(range.startAt)} · {formatTimeVi(range.startAt)}–{formatTimeVi(range.endAt)}</p><p>{range.slotCount} slot · {formatDuration(range.durationMinutes)}</p><strong className="text-figures text-2xl text-ink-900">{formatMoneyVnd(range.totalPrice)}</strong></div>
}
