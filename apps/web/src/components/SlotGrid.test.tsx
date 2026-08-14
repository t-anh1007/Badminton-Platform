import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SlotGrid } from './SlotGrid.js'

it('marks a selected available slot with text and aria state', () => {
  render(<SlotGrid courtName="Sân 1" slots={[{ time: '08:00', status: 'available', price: 90000, selected: true }]} />)
  expect(screen.getByRole('button', { name: /chọn 08:00/i })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('ĐÃ CHỌN')).toBeInTheDocument()
})
