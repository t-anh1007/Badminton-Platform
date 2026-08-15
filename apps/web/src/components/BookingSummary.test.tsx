import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { BookingSummary } from './BookingSummary.js'

it('shows deterministic local wall-clock booking details without shifting UTC slot minutes', () => {
  render(<BookingSummary venue="Sân A" court="Court 1" range={{ courtId: 'c', date: '2026-08-15', startAt: '2026-08-15T06:00:00.000Z', endAt: '2026-08-15T07:00:00.000Z', slotCount: 2, durationMinutes: 60, totalPrice: '180000' }} />)
  expect(screen.getByText('15/08/2026 · 06:00–07:00')).toBeInTheDocument()
  expect(screen.getByText('2 slot · 1 giờ')).toBeInTheDocument()
  expect(screen.getByText(/180\.000/)).toBeInTheDocument()
})
