import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cancelMyBooking, getBookingDetail } from '../lib/venueBookingApi.js'
import { BookingCancellationPanel } from './BookingCancellationPanel.js'
import { BookingCard } from './BookingCard.js'

vi.mock('../lib/venueBookingApi.js', () => ({ getBookingDetail: vi.fn(), cancelMyBooking: vi.fn() }))
const booking = (id: string, status = 'confirmed') => ({ id, courtId: `c-${id}`, startAt: '2026-08-15T08:00:00Z', endAt: '2026-08-15T09:00:00Z', status, priceSnapshot: '180000', court: { name: `Sân ${id}`, venue: { name: 'Nhà thi đấu' } } })
afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

it('renders the refund preview inside its booking and hides all cancellation actions once cancelled', () => {
  const view = render(<BookingCard booking={booking('1')} preview={50} onPreview={vi.fn()} onConfirm={vi.fn()} onDismiss={vi.fn()} />)
  expect(screen.getByText('Bạn sẽ được hoàn 50% — 90.000đ.')).toBeInTheDocument()
  view.rerender(<BookingCard booking={booking('1', 'cancelled')} preview={50} onPreview={vi.fn()} onConfirm={vi.fn()} onDismiss={vi.fn()} />)
  expect(screen.queryByRole('button', { name: /hủy|hoàn/i })).not.toBeInTheDocument()
})

it('shows the complete court-local range and lets a held booking release its slot immediately', async () => {
  vi.mocked(cancelMyBooking).mockResolvedValue({ status: 'cancelled', refundPercent: 0 })
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(<BookingCancellationPanel bookings={[booking('1', 'held')]} cancellable onChanged={onChanged} />)

  expect(screen.getByText('15/08/2026 · 15:00–16:00')).toBeInTheDocument()
  expect(screen.getByText('Đang giữ chỗ · chưa thanh toán')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Xem mức hoàn' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hủy giữ chỗ' }))

  await waitFor(() => expect(cancelMyBooking).toHaveBeenCalledWith('1'))
  expect(getBookingDetail).not.toHaveBeenCalled()
  expect(onChanged).toHaveBeenCalledTimes(1)
})

it('keys previews per booking, clears stale selection and reloads both lists after cancellation', async () => {
  vi.mocked(getBookingDetail).mockResolvedValueOnce({ booking: booking('1'), expectedRefundPercent: 50, courtChangeNote: null }).mockResolvedValueOnce({ booking: booking('2'), expectedRefundPercent: 100, courtChangeNote: null })
  vi.mocked(cancelMyBooking).mockResolvedValue({ status: 'cancelled', refundPercent: 100 }); const onChanged = vi.fn().mockResolvedValue(undefined)
  render(<BookingCancellationPanel bookings={[booking('1'), booking('2')]} cancellable onChanged={onChanged} />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Xem mức hoàn' })[0]!); expect(await screen.findByText(/50%/)).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Xem mức hoàn' })[1]!); expect(await screen.findByText(/100%/)).toBeInTheDocument(); expect(screen.queryByText(/50%/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' })); await waitFor(() => expect(cancelMyBooking).toHaveBeenCalledWith('2')); expect(onChanged).toHaveBeenCalledTimes(1)
})
