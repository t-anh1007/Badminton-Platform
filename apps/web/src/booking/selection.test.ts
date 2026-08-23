import { describe, expect, it } from 'vitest'
import { toVietnameseSlotIso, toggleSlot, type SelectableSlot } from './selection.js'

it('converts venue wall-clock minutes to the matching Vietnam instant', () => {
  expect(toVietnameseSlotIso('2026-08-25', 9 * 60)).toBe('2026-08-25T02:00:00.000Z')
  expect(toVietnameseSlotIso('2026-08-25', 10 * 60)).toBe('2026-08-25T03:00:00.000Z')
})

it('keeps a Vietnam 09:00-10:00 selection at 60 minutes', () => {
  const localSlots: SelectableSlot[] = [
    { courtId: 'c1', date: '2026-08-25', startAt: '2026-08-25T02:00:00.000Z', endMinute: 570, available: true, price: '30000' },
    { courtId: 'c1', date: '2026-08-25', startAt: '2026-08-25T02:30:00.000Z', endMinute: 600, available: true, price: '30000' },
  ]
  const first = toggleSlot(null, localSlots[0], localSlots)!
  expect(toggleSlot(first, localSlots[1], localSlots)).toMatchObject({
    startAt: '2026-08-25T02:00:00.000Z',
    endAt: '2026-08-25T03:00:00.000Z',
    durationMinutes: 60,
  })
})
const slots: SelectableSlot[] = [0, 1, 2].map((hour) => ({ courtId: 'c1', date: '2026-08-15', startAt: toVietnameseSlotIso('2026-08-15', (hour + 8) * 60), endMinute: (hour + 9) * 60, available: true, price: String((hour + 1) * 10000) }))
describe('contiguous booking selection', () => {
  it('starts, extends forward and sums exact bigint prices', () => { const one = toggleSlot(null, slots[0], slots)!; const two = toggleSlot(one, slots[1], slots)!; expect(two).toMatchObject({ slotCount: 2, totalPrice: '30000', durationMinutes: 120, endAt: toVietnameseSlotIso('2026-08-15', 10 * 60) }) })
  it('extends backward and shrinks either endpoint', () => { const second = toggleSlot(null, slots[1], slots)!; const range = toggleSlot(second, slots[0], slots)!; expect(toggleSlot(range, slots[0], slots)).toMatchObject({ startAt: slots[1].startAt }); expect(toggleSlot(range, slots[1], slots)).toMatchObject({ startAt: slots[0].startAt, slotCount: 1 }) })
  it('rejects a gap or unavailable slot', () => { const one = toggleSlot(null, slots[0], slots)!; expect(toggleSlot(one, slots[2], slots)).toEqual(one); expect(toggleSlot(one, { ...slots[1], available: false }, slots)).toEqual(one) })
  it('rejects adjacent array entries that have a real clock gap', () => {
    const separated = [
      { courtId: 'c1', date: '2026-08-15', startAt: toVietnameseSlotIso('2026-08-15', 8 * 60), endMinute: 510, available: true, price: '10000' },
      { courtId: 'c1', date: '2026-08-15', startAt: toVietnameseSlotIso('2026-08-15', 10 * 60), endMinute: 630, available: true, price: '10000' },
    ]
    const first = toggleSlot(null, separated[0], separated)!
    expect(toggleSlot(first, separated[1], separated)).toEqual(first)
  })
  it('starts a new range when court or date changes', () => { const one = toggleSlot(null, slots[0], slots)!; const other = { ...slots[1], courtId: 'c2', date: '2026-08-16', startAt: toVietnameseSlotIso('2026-08-16', 9 * 60) }; expect(toggleSlot(one, other, [...slots, other])).toMatchObject({ courtId: 'c2', date: '2026-08-16', slotCount: 1 }) })
})
