import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { QuickMatchModal } from './QuickMatchModal.js'

it('shows live progress and requires an explicit accept', () => {
  const accept = vi.fn()
  render(<QuickMatchModal open progress={{ elapsedMs: 3200, scannedCount: 8, candidateCount: 1, phase: 'proposal' }} proposal={{ matchId: 'm1', openSlots: 1, feePerSlot: '45000', startAt: '2026-08-15T08:00:00Z', endAt: '2026-08-15T09:00:00Z', court: { id: 'c1', name: 'Sân 1' }, venue: { id: 'v1', name: 'Nhà thi đấu', address: 'Q1', lat: 10, lng: 106 } }} onCancel={vi.fn()} onAccept={accept} />)
  expect(screen.getByText('8')).toBeInTheDocument()
  expect(accept).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận tham gia' }))
  expect(accept).toHaveBeenCalledWith('m1')
})

it('can stop a search and closes with Escape', () => {
  const cancel = vi.fn()
  render(<QuickMatchModal open progress={{ elapsedMs: 0, scannedCount: 0, candidateCount: 0, phase: 'searching' }} proposal={null} onCancel={cancel} onAccept={vi.fn()} />)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(cancel).toHaveBeenCalledTimes(1)
})
