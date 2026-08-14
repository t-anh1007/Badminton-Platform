export interface SelectableSlot { courtId: string; date: string; startAt: string; endMinute: number; available: boolean; price: string }
export interface BookingRange { courtId: string; date: string; startAt: string; endAt: string; slotCount: number; durationMinutes: number; totalPrice: string }
export function toggleSlot(range: BookingRange | null, slot: SelectableSlot, allSlots: SelectableSlot[]): BookingRange | null {
  if (!slot.available) return range
  const ordered = allSlots.filter((item) => item.courtId === slot.courtId && item.date === slot.date).sort((a,b) => a.startAt.localeCompare(b.startAt))
  const selected = range && range.courtId === slot.courtId && range.date === slot.date ? ordered.filter((item) => item.startAt >= range.startAt && item.startAt < range.endAt) : []
  const index = ordered.findIndex((item) => item.startAt === slot.startAt)
  if (index < 0) return range
  let next: SelectableSlot[]
  if (!selected.length) next = [slot]
  else if (slot.startAt === range!.startAt || slot.startAt === selected.at(-1)!.startAt) next = selected.filter((item) => item.startAt !== slot.startAt)
  else if (index === ordered.findIndex((item) => item.startAt === range!.startAt) - 1 || index === ordered.findIndex((item) => item.startAt === selected.at(-1)!.startAt) + 1) next = [...selected, slot]
  else return range
  if (!next.length) return null
  next = next.sort((a,b) => a.startAt.localeCompare(b.startAt)); if (next.some((item) => !item.available)) return range
  const first = next[0], last = next.at(-1)!; const endAt = new Date(new Date(last.startAt).setUTCHours(Math.floor(last.endMinute / 60), last.endMinute % 60, 0, 0)).toISOString()
  return { courtId: first.courtId, date: first.date, startAt: first.startAt, endAt, slotCount: next.length, durationMinutes: (new Date(endAt).getTime() - new Date(first.startAt).getTime()) / 60000, totalPrice: next.reduce((sum, item) => sum + BigInt(item.price), 0n).toString() }
}
