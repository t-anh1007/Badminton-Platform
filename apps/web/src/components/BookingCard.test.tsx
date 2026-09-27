import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cancelMyBooking, getBookingDetail } from '../lib/venueBookingApi.js'
import { BookingCancellationPanel } from './BookingCancellationPanel.js'
import { BookingCard } from './BookingCard.js'

vi.mock('../lib/venueBookingApi.js', () => ({ getBookingDetail: vi.fn(), cancelMyBooking: vi.fn() }))
const booking = (id: string, status = 'confirmed') => ({ id, businessCode: `BK-${id.padStart(8, '0')}`, courtId: `c-${id}`, startAt: '2026-08-15T08:00:00Z', endAt: '2026-08-15T09:00:00Z', status, priceSnapshot: '180000', court: { name: `Sân ${id}`, venue: { name: 'Nhà thi đấu' } } })
afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

it('renders the refund preview inside its booking and hides all cancellation actions once cancelled', () => {
  const view = render(<BookingCard booking={booking('1')} preview={50} onPreview={vi.fn()} onConfirm={vi.fn()} onDismiss={vi.fn()} />)
  expect(screen.getByText('BK-00000001')).toBeInTheDocument()
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

it('labels a match hold with a paid organizer deposit clearly', () => {
  render(<BookingCard booking={{ ...booking('1', 'held'), matchDepositPaid: true }} preview={null} onPreview={vi.fn()} onConfirm={vi.fn()} onDismiss={vi.fn()} />)

  expect(screen.getByText('Đang giữ chỗ · đã đặt cọc')).toBeInTheDocument()
  expect(screen.queryByText('Đang giữ chỗ · chưa thanh toán')).not.toBeInTheDocument()
})

it('reveals cancelled-booking details only on request, using the provider booking code', () => {
  const cancelled = {
    ...booking('1', 'cancelled'), businessCode: 'BK-00001234', createdAt: '2026-08-01T10:00:00Z',
    cancellationReason: 'provider_fault' as const, cancellationRefundPercent: 100,
    shutdownRefundStatus: 'completed' as const,
    court: { name: 'Sân 1', venue: { name: 'Nhà thi đấu', address: '12 Nguyễn Trãi, Quận 1' } },
  }
  render(<BookingCard booking={cancelled} preview={null} onPreview={vi.fn()} onConfirm={vi.fn()} onDismiss={vi.fn()} />)
  const toggle = screen.getByRole('button', { name: 'Xem chi tiết booking' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('BK-00001234')).not.toBeInTheDocument()
  expect(screen.queryByText('12 Nguyễn Trãi, Quận 1')).not.toBeInTheDocument()
  fireEvent.click(toggle)
  expect(screen.getByRole('button', { name: 'Ẩn chi tiết booking' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('BK-00001234')).toBeInTheDocument()
  expect(screen.getByText('12 Nguyễn Trãi, Quận 1')).toBeInTheDocument()
  expect(screen.getByText('Ngày đặt:')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ẩn chi tiết booking' }))
  expect(screen.queryByText('BK-00001234')).not.toBeInTheDocument()
})

it('keys previews per booking, clears stale selection and reloads both lists after cancellation', async () => {
  vi.mocked(getBookingDetail).mockResolvedValueOnce({ booking: booking('1'), expectedRefundPercent: 50, courtChangeNote: null }).mockResolvedValueOnce({ booking: booking('2'), expectedRefundPercent: 100, courtChangeNote: null })
  vi.mocked(cancelMyBooking).mockResolvedValue({ status: 'cancelled', refundPercent: 100 }); const onChanged = vi.fn().mockResolvedValue(undefined)
  render(<BookingCancellationPanel bookings={[booking('1'), booking('2')]} cancellable onChanged={onChanged} />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Xem mức hoàn' })[0]!); expect(await screen.findByText(/50%/)).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Xem mức hoàn' })[1]!); expect(await screen.findByText(/100%/)).toBeInTheDocument(); expect(screen.queryByText(/50%/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' })); await waitFor(() => expect(cancelMyBooking).toHaveBeenCalledWith('2')); expect(onChanged).toHaveBeenCalledTimes(1)
})
