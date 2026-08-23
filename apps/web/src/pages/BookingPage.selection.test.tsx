import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBooking, createHold, getCourtAvailability, getVenueDetail, selectSlot } from '../lib/venueBookingApi.js'
import { createMatch } from '../lib/matchApi.js'
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
vi.mock('../lib/matchApi.js', () => ({ createMatch: vi.fn() }))
vi.mock('../components/MatchDepositCheckout.js', () => ({ MatchDepositCheckout: () => <div>Cọc tạo kèo (50%)</div> }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-08-14T02:00:00.000Z'))
  vi.mocked(getVenueDetail).mockResolvedValue({ id: 'v1', name: 'Nhà thi đấu Phú Nhuận', address: '123 Demo', lat: 0, lng: 0, amenities: [], images: [], courts: [{ id: 'c1', name: 'Sân 1', images: ['https://cdn.test/court.webp'], bookingRule: { stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 120 } }] })
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

it('creates one singles split match from the selected hold and opens deposit checkout', async () => {
  vi.mocked(createHold).mockResolvedValue({ id: 'hold-internal', courtId: 'c1', startAt: '2026-08-14T23:00:00.000Z', endAt: '2026-08-15T00:00:00.000Z', expiresAt: '2026-08-14T02:10:00.000Z' })
  vi.mocked(createMatch).mockResolvedValue({ id: 'match-internal' } as never)
  render(<MemoryRouter initialEntries={['/booking?venueId=v1']}><BookingPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Chọn 06:00 - 06:30' }))
  fireEvent.click(screen.getByRole('button', { name: 'Chọn 06:30 - 07:00' }))
  expect(await screen.findByRole('button', { name: 'XÁC NHẬN' })).toBeInTheDocument()
  const findButton = screen.getByRole('button', { name: 'TÌM ĐỐI THỦ' })
  fireEvent.click(findButton)
  fireEvent.click(findButton)
  await waitFor(() => expect(createHold).toHaveBeenCalledWith({ courtId: 'c1', startAt: '2026-08-14T23:00:00.000Z', endAt: '2026-08-15T00:00:00.000Z' }))
  expect(createMatch).toHaveBeenCalledWith({ holdId: 'hold-internal', capacity: 2, feeMode: 'split' })
  expect(createMatch).toHaveBeenCalledTimes(1)
  expect(await screen.findByText('Cọc tạo kèo (50%)')).toBeInTheDocument()
  expect(screen.queryByText(/Giữ chỗ \d{2}:\d{2}/)).not.toBeInTheDocument()
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  expect(screen.getByText('Cọc tạo kèo (50%)')).toBeInTheDocument()
  expect(createBooking).not.toHaveBeenCalled()
})

it('guards concurrent creation and reuses the pending hold after match creation fails', async () => {
  let resolveHold!: (value: Awaited<ReturnType<typeof createHold>>) => void
  const deferredHold = new Promise<Awaited<ReturnType<typeof createHold>>>((resolve) => { resolveHold = resolve })
  vi.mocked(createHold).mockReturnValue(deferredHold)
  vi.mocked(createMatch).mockRejectedValueOnce(new Error('Tạo kèo thất bại')).mockResolvedValueOnce({ id: 'match-retry' } as never)
  render(<MemoryRouter initialEntries={['/booking?venueId=v1']}><BookingPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Chọn 06:00 - 06:30' }))
  fireEvent.click(screen.getByRole('button', { name: 'Chọn 06:30 - 07:00' }))
  const findButton = await screen.findByRole('button', { name: 'TÌM ĐỐI THỦ' })
  fireEvent.click(findButton)
  fireEvent.click(findButton)
  expect(createHold).toHaveBeenCalledTimes(1)
  resolveHold({ id: 'hold-race', courtId: 'c1', startAt: '2026-08-14T23:00:00.000Z', endAt: '2026-08-15T00:00:00.000Z', expiresAt: '2026-08-14T02:10:00.000Z' })
  expect(await screen.findByRole('alert')).toHaveTextContent('Tạo kèo thất bại')
  fireEvent.click(screen.getByRole('button', { name: 'TÌM ĐỐI THỦ' }))
  await waitFor(() => expect(screen.getByText('Cọc tạo kèo (50%)')).toBeInTheDocument())
  expect(createHold).toHaveBeenCalledTimes(1)
  expect(createMatch).toHaveBeenNthCalledWith(2, { holdId: 'hold-race', capacity: 2, feeMode: 'split' })
})

it('shows elapsed slots for today but does not allow selecting them', async () => {
  vi.setSystemTime(new Date('2026-08-14T09:15:00.000Z')) // 16:15 tại Việt Nam
  vi.mocked(getCourtAvailability).mockResolvedValue({ closed: false, slots: [
    { startMinute: 16 * 60, endMinute: 16 * 60 + 30, available: true, price: '180000' },
    { startMinute: 16 * 60 + 30, endMinute: 17 * 60, available: true, price: '180000' },
  ] })

  render(<MemoryRouter initialEntries={['/booking?venueId=v1']}><BookingPage /></MemoryRouter>)
  const dateField = await screen.findByRole('textbox', { name: /ngày đặt sân/i })
  fireEvent.change(dateField, { target: { value: '14/08/2026' } })

  const elapsed = await screen.findByRole('button', { name: 'Đã qua 16:00 - 16:30' })
  expect(elapsed).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Chọn 16:30 - 17:00' })).toBeEnabled()
  expect(screen.getByText('Đã qua')).toBeInTheDocument()
})

it('clears stale slots when a past date is rejected', async () => {
  vi.mocked(getCourtAvailability)
    .mockResolvedValueOnce({ closed: false, slots: [{ startMinute: 360, endMinute: 390, available: true, price: '180000' }] })
    .mockRejectedValueOnce(new Error('Không thể xem lịch của ngày đã qua.'))

  render(<MemoryRouter initialEntries={['/booking?venueId=v1']}><BookingPage /></MemoryRouter>)
  expect(await screen.findByRole('button', { name: 'Chọn 06:00 - 06:30' })).toBeInTheDocument()

  fireEvent.change(screen.getByRole('textbox', { name: /ngày đặt sân/i }), { target: { value: '13/08/2026' } })

  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xem lịch của ngày đã qua.')
  expect(screen.queryByRole('button', { name: /06:00 - 06:30/ })).not.toBeInTheDocument()
})
