import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBooking, createHold, getCourtAvailability, getVenueDetail, selectSlot } from '../lib/venueBookingApi.js'
import { BookingPage } from './BookingPage.js'

vi.mock('../lib/venueBookingApi.js', () => ({
  getVenueDetail: vi.fn(),
  getCourtAvailability: vi.fn(),
  selectSlot: vi.fn(),
  createHold: vi.fn(),
  createBooking: vi.fn(),
  waitForBookingTerminal: vi.fn(),
}))
vi.mock('../lib/financeApi.js', () => ({ createBookingSepayIntent: vi.fn(), payBookingBalance: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-08-14T02:00:00.000Z'))
  vi.mocked(getVenueDetail).mockResolvedValue({ id: 'v1', name: 'Nhà thi đấu Phú Nhuận', address: '123 Demo', lat: 0, lng: 0, amenities: [], images: [], courts: [{ id: 'c1', name: 'Sân 1', bookingRule: { stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 120 } }] })
  vi.mocked(getCourtAvailability).mockResolvedValue({ closed: false, slots: [
    { startMinute: 360, endMinute: 390, available: true, price: '180000' },
    { startMinute: 390, endMinute: 420, available: true, price: '180000' },
  ] })
  vi.mocked(selectSlot).mockImplementation(async (_courtId, body) => ({
    courtId: 'c1',
    startAt: body.startAt,
    endAt: new Date(new Date(body.startAt).getTime() + body.durationMinutes * 60_000).toISOString(),
    durationMinutes: body.durationMinutes,
    totalPrice: body.durationMinutes === 60 ? '360000' : '180000',
  }))
})

afterEach(() => { cleanup(); vi.useRealTimers() })

it('uses dd/MM/yyyy and wires contiguous selections into the visible summary', async () => {
  render(<MemoryRouter initialEntries={['/booking?venueId=v1']}><BookingPage /></MemoryRouter>)

  const dateField = await screen.findByRole('textbox', { name: /ngày đặt sân/i })
  expect(dateField).toHaveValue('15/08/2026')
  expect(dateField).toHaveAttribute('inputmode', 'numeric')

  const first = await screen.findByRole('button', { name: 'Chọn 06:00 - 06:30' })
  const second = await screen.findByRole('button', { name: 'Chọn 06:30 - 07:00' })
  fireEvent.click(first)
  await waitFor(() => expect(first).toHaveAttribute('aria-pressed', 'true'))
  // Một slot (30') dưới thời lượng tối thiểu 60' — chưa gọi select-slot, chỉ nhắc chọn thêm.
  expect(selectSlot).not.toHaveBeenCalled()
  expect(screen.getByText(/chọn thêm 1 khung giờ/i)).toBeInTheDocument()
  fireEvent.click(second)

  await waitFor(() => {
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(second).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/2 slot/)).toBeInTheDocument()
    expect(screen.getByText(/1 giờ/)).toBeInTheDocument()
  })
  expect(selectSlot).toHaveBeenLastCalledWith('c1', expect.objectContaining({ durationMinutes: 60 }))
})

it('uses one confirmation action to create a hold and booking, then locks selection controls', async () => {
  vi.mocked(createHold).mockResolvedValue({ id: 'hold-internal', courtId: 'c1', startAt: '2026-08-15T06:00:00.000Z', endAt: '2026-08-15T06:30:00.000Z', expiresAt: '2026-08-15T02:10:00.000Z' })
  vi.mocked(createBooking).mockResolvedValue({ id: 'booking-internal', courtId: 'c1', startAt: '2026-08-15T06:00:00.000Z', endAt: '2026-08-15T06:30:00.000Z', status: 'held', priceSnapshot: '180000' })
  const view = render(<MemoryRouter initialEntries={['/booking?venueId=v1']}><BookingPage /></MemoryRouter>)
  const first = await view.findByRole('button', { name: 'Chọn 06:00 - 06:30' })
  const second = await view.findByRole('button', { name: 'Chọn 06:30 - 07:00' })
  fireEvent.click(first)
  // Cần đạt tối thiểu 60' trước khi có nút xác nhận.
  await waitFor(() => expect(view.getByText(/để xác nhận đặt sân/i)).toBeInTheDocument())
  expect(view.queryByRole('button', { name: 'XÁC NHẬN' })).not.toBeInTheDocument()
  fireEvent.click(second)
  await waitFor(() => expect(view.getByRole('button', { name: 'XÁC NHẬN' })).toBeInTheDocument())
  fireEvent.click(view.getByRole('button', { name: 'XÁC NHẬN' }))
  await waitFor(() => expect(createBooking).toHaveBeenCalledWith('hold-internal'))
  await waitFor(() => expect(within(view.container).getByRole('textbox', { name: /ngày đặt sân/i })).toBeDisabled())
  expect(within(view.container).getByRole('combobox')).toBeDisabled()
})
