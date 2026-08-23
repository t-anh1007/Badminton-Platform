import { describe, expect, it } from 'vitest'
import { formatDateTimeVi, formatDateVi, formatDuration, formatMoneyVnd, vietnamDateInput, vietnamMinuteOfDay } from './formatters.js'

describe('Vietnamese presentation formatters', () => {
  it('formats API timestamps in the approved Vietnamese date format', () => {
    expect(formatDateVi('2026-08-15T00:00:00+07:00')).toBe('15/08/2026')
    expect(formatDateTimeVi('2026-08-15T09:05:00+07:00')).toBe('15/08/2026 09:05')
  })

  it('reads date input and minute-of-day in the Vietnam time zone', () => {
    expect(vietnamDateInput('2026-08-22T18:00:00.000Z')).toBe('2026-08-23')
    expect(vietnamMinuteOfDay('2026-08-23T12:00:00.000Z')).toBe(19 * 60)
  })

  it('formats VND and duration from domain values', () => {
    expect(formatMoneyVnd('180000')).toBe('180.000đ')
    expect(formatMoneyVnd(45000)).toBe('45.000đ')
    expect(formatDuration(90)).toBe('1 giờ 30 phút')
  })
})
