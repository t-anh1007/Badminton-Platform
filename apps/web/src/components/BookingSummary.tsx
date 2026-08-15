import type { BookingRange } from '../booking/selection.js'
import { formatDuration, formatMoneyVnd } from '../lib/formatters.js'

function formatDate(value: string) {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function formatUtcWallTime(value: string) {
  const date = new Date(value)
  return `${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')}`
}

export function BookingSummary({ venue, court, range }: { venue: string; court: string; range: BookingRange }) {
  return (
    <div className="mt-4 space-y-2 text-sm text-ink-500">
      <p>{venue} · {court}</p>
      <p>{formatDate(range.date)} · {formatUtcWallTime(range.startAt)}–{formatUtcWallTime(range.endAt)}</p>
      <p>{range.slotCount} slot · {formatDuration(range.durationMinutes)}</p>
      <strong className="text-figures text-2xl text-ink-900">{formatMoneyVnd(range.totalPrice)}</strong>
    </div>
  )
}
