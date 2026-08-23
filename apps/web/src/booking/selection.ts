export interface SelectableSlot {
  courtId: string
  date: string
  startAt: string
  endMinute: number
  available: boolean
  price: string
}

export interface BookingRange {
  courtId: string
  date: string
  startAt: string
  endAt: string
  slotCount: number
  durationMinutes: number
  totalPrice: string
}

const VIETNAM_OFFSET_MINUTES = 7 * 60

/** Converts a venue wall-clock minute on a Vietnam calendar date to UTC ISO. */
export function toVietnameseSlotIso(date: string, minute: number) {
  const instant = new Date(`${date}T00:00:00.000Z`)
  instant.setUTCMinutes(minute - VIETNAM_OFFSET_MINUTES)
  return instant.toISOString()
}

function startMinute(slot: SelectableSlot) {
  const vietnamMidnight = new Date(toVietnameseSlotIso(slot.date, 0))
  return (new Date(slot.startAt).getTime() - vietnamMidnight.getTime()) / 60_000
}

function endAt(slot: SelectableSlot) {
  return toVietnameseSlotIso(slot.date, slot.endMinute)
}

export function toggleSlot(range: BookingRange | null, slot: SelectableSlot, allSlots: SelectableSlot[]): BookingRange | null {
  if (!slot.available) return range
  const ordered = allSlots
    .filter((item) => item.courtId === slot.courtId && item.date === slot.date)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
  const selected = range && range.courtId === slot.courtId && range.date === slot.date
    ? ordered.filter((item) => item.startAt >= range.startAt && item.startAt < range.endAt)
    : []
  const index = ordered.findIndex((item) => item.startAt === slot.startAt)
  if (index < 0) return range

  let next: SelectableSlot[]
  if (!selected.length) {
    next = [slot]
  } else if (slot.startAt === range!.startAt || slot.startAt === selected.at(-1)!.startAt) {
    next = selected.filter((item) => item.startAt !== slot.startAt)
  } else {
    const firstIndex = ordered.findIndex((item) => item.startAt === range!.startAt)
    const lastIndex = ordered.findIndex((item) => item.startAt === selected.at(-1)!.startAt)
    const extendsBackward = index === firstIndex - 1 && slot.endMinute === startMinute(selected[0])
    const extendsForward = index === lastIndex + 1 && selected.at(-1)!.endMinute === startMinute(slot)
    if (!extendsBackward && !extendsForward) return range
    next = [...selected, slot]
  }

  if (!next.length) return null
  next = next.sort((a, b) => a.startAt.localeCompare(b.startAt))
  if (next.some((item) => !item.available)) return range
  const first = next[0]
  const last = next.at(-1)!
  const finalEndAt = endAt(last)
  return {
    courtId: first.courtId,
    date: first.date,
    startAt: first.startAt,
    endAt: finalEndAt,
    slotCount: next.length,
    durationMinutes: (new Date(finalEndAt).getTime() - new Date(first.startAt).getTime()) / 60_000,
    totalPrice: next.reduce((sum, item) => sum + BigInt(item.price), 0n).toString(),
  }
}
