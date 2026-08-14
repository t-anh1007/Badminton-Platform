import { formatDateVi, formatDuration, formatMoneyVnd } from '../lib/formatters.js'
import type { BookingRange } from '../booking/selection.js'
export function BookingSummary({ venue, court, range }: { venue: string; court: string; range: BookingRange }) { return <div><p>{venue} · {court}</p><p>{formatDateVi(range.startAt)} · {new Date(range.startAt).toISOString().slice(11,16)}–{new Date(range.endAt).toISOString().slice(11,16)}</p><p>{range.slotCount} slot · {formatDuration(range.durationMinutes)}</p><strong>{formatMoneyVnd(range.totalPrice)}</strong></div> }
