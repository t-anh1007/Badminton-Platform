import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { BookingPaymentPanel } from './BookingPaymentPanel.js'
import { payBookingBalance } from '../lib/financeApi.js'
import { waitForBookingTerminal } from '../lib/venueBookingApi.js'

vi.mock('../lib/financeApi.js', () => ({ payBookingBalance: vi.fn(), createBookingSepayIntent: vi.fn() }))
vi.mock('../lib/venueBookingApi.js', () => ({ waitForBookingTerminal: vi.fn() }))

beforeEach(() => { vi.clearAllMocks() })

it('pays the held booking, stops waiting at a confirmed terminal state and navigates', async () => {
  vi.mocked(payBookingBalance).mockResolvedValue({ message: 'ok' })
  vi.mocked(waitForBookingTerminal).mockResolvedValue({ booking: { id: 'internal-id', courtId: 'c1', startAt: '2026-08-15T06:00:00.000Z', endAt: '2026-08-15T07:00:00.000Z', status: 'confirmed', priceSnapshot: '180000', terminalStatus: 'confirmed' }, expectedRefundPercent: 0, courtChangeNote: null })
  const onConfirmed = vi.fn()
  render(<BookingPaymentPanel bookingId="internal-id" holdExpiresAt="2026-08-15T00:10:00.000Z" onConfirmed={onConfirmed} onRecover={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /thanh toán số dư/i }))
  await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
  expect(screen.queryByText(/Mã booking/i)).not.toBeInTheDocument()
})

it('shows recovery when polling observes a late cancellation', async () => {
  vi.mocked(waitForBookingTerminal).mockResolvedValue({ booking: { id: 'internal-id', courtId: 'c1', startAt: '', endAt: '', status: 'cancelled', priceSnapshot: '0', terminalStatus: 'cancelled' }, expectedRefundPercent: 0, courtChangeNote: null })
  render(<BookingPaymentPanel bookingId="internal-id" holdExpiresAt="2020-01-01T00:00:00.000Z" onConfirmed={vi.fn()} onRecover={vi.fn()} />)
  expect(await screen.findByText(/hết hạn hoặc đã bị hủy/i)).toBeInTheDocument()
})
