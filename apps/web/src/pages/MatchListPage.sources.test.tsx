import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MatchListPage } from './MatchListPage.js'
import { createMatch, getFundingPreview } from '../lib/matchApi.js'
import { getMyMatchSources } from '../lib/venueBookingApi.js'
import { getOwnPassport } from '../lib/passportApi'

vi.mock('../components/QuickMatchPanel.js', () => ({ QuickMatchPanel: () => null }))
vi.mock('../lib/matchApi.js', () => ({
  listMatches: vi.fn().mockResolvedValue({ matches: [] }),
  getMatchDetail: vi.fn(),
  createMatch: vi.fn().mockResolvedValue({ id: 'm1' }),
  getFundingPreview: vi.fn(),
}))
vi.mock('../lib/venueBookingApi.js', () => ({ getMyMatchSources: vi.fn() }))
vi.mock('../lib/passportApi', () => ({ getOwnPassport: vi.fn() }))

const place = { venue: { id: 'v1', name: 'Nhà thi đấu A', address: '12 Lê Lợi, Quận 1', provinceCode: 'ho-chi-minh' }, court: { id: 'c1', name: 'Sân 1' } }

afterEach(() => cleanup())

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.setItem('accessToken', 'token')
  vi.mocked(getOwnPassport).mockResolvedValue({ singles: {}, doubles: {} } as never)
  vi.mocked(getMyMatchSources).mockResolvedValue({
    sources: [
      { sourceType: 'hold', holdId: 'h1', bookingStatus: 'held', holdExpiresAt: '2026-10-14T08:10:00Z', price: '200000', startAt: '2026-10-15T08:00:00Z', endAt: '2026-10-15T09:00:00Z', ...place },
      { sourceType: 'paid_booking', bookingId: 'b1', bookingStatus: 'confirmed', price: '200000', startAt: '2026-10-16T08:00:00Z', endAt: '2026-10-16T10:00:00Z', ...place },
    ],
  })
  vi.mocked(getFundingPreview).mockImplementation(async ({ sourceType, ratio }) => ({
    bookingPrice: '200000', resultHeldAmount: ratio === '7:3' ? '80000' : '0', regularSlotAmount: '140000', organizerContribution: '140000',
    alreadyPaid: sourceType === 'paid_booking' ? '200000' : '0', additionalOwnerCharge: sourceType === 'paid_booking' ? '0' : '140000',
    organizerRefundAtLock: sourceType === 'paid_booking' ? '60000' : '0', netCostIfWin: '60000', netCostIfLose: '140000',
  }))
})

const openCreate = async () => {
  render(<MemoryRouter><MatchListPage /></MemoryRouter>)
  fireEvent.click((await screen.findAllByRole('button', { name: 'Tạo kèo' }))[0]!)
  await screen.findByRole('heading', { name: 'Tạo kèo mới' })
}

it('creates from a held slot with the strict Task 5 body and never exposes the raw id', async () => {
  await openCreate()
  expect(await screen.findByRole('option', { name: /Nhà thi đấu A - Sân 1/ })).toBeInTheDocument()
  expect(screen.queryByText('h1')).not.toBeInTheDocument()
  // Slot 60 phút: chỉ BO3.
  expect(screen.getByRole('option', { name: /BO5/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('radio', { name: /Xếp hạng/ }))
  fireEvent.click(screen.getByRole('radio', { name: /Đánh đôi/ }))
  fireEvent.click(screen.getByRole('radio', { name: /7 : 3/ }))
  expect(await screen.findByText('80.000đ')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Công bố kèo' }))
  await waitFor(() => expect(createMatch).toHaveBeenCalledWith({
    holdId: 'h1', mode: 'ranked', discipline: 'doubles', ratio: '7:3', format: 'bo3', skillMin: 'intermediate', skillMax: 'intermediate_plus',
  }))
  expect(getFundingPreview).toHaveBeenLastCalledWith({ price: '200000', ratio: '7:3', discipline: 'doubles', sourceType: 'hold' })
})

it('explains a paid booking is not charged twice and renders the owner refund from the backend preview', async () => {
  await openCreate()
  fireEvent.click(screen.getByRole('radio', { name: /Lượt đặt sân đã thanh toán/ }))
  expect(await screen.findByText(/không thu hay ghi nhận tiền sân lần hai/)).toBeInTheDocument()
  const refundRow = (await screen.findByText('Dự kiến hoàn khi chốt kèo')).parentElement!.parentElement!
  expect(refundRow).toHaveTextContent('60.000đ')
  expect(refundRow).toHaveTextContent('Có thể rút')
  // Booking 120 phút: được chọn BO5.
  expect(screen.getByRole('option', { name: /BO5/ })).not.toBeDisabled()
  fireEvent.change(screen.getByRole('combobox', { name: /Thể thức chính thức/ }), { target: { value: 'bo5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Công bố kèo' }))
  await waitFor(() => expect(createMatch).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'b1', format: 'bo5' })))
})

it('summarizes errors and blocks an inverted skill range', async () => {
  await openCreate()
  fireEvent.change(await screen.findByRole('combobox', { name: 'Bậc tối thiểu' }), { target: { value: 'advanced' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Bậc tối đa' }), { target: { value: 'beginner' } })
  fireEvent.click(screen.getByRole('button', { name: 'Công bố kèo' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Bậc tối thiểu không được cao hơn bậc tối đa.')
  expect(createMatch).not.toHaveBeenCalled()
})

it('tells the organizer until when the held slot is kept', async () => {
  await openCreate()
  expect(await screen.findByText(/Slot được giữ đến .*nếu không slot sẽ tự nhả/)).toBeInTheDocument()
})

it('blocks a ranked match until the organizer declares the level for that discipline', async () => {
  vi.mocked(getOwnPassport).mockResolvedValue({ singles: null, doubles: {} } as never)
  await openCreate()
  fireEvent.click(screen.getByText('Xếp hạng', { exact: true }))
  expect(await screen.findByText(/Bạn chưa khai trình độ đánh đơn/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Khai trình độ ngay' })).toHaveAttribute('href', '/passport')
  fireEvent.click(screen.getByRole('button', { name: 'Công bố kèo' }))
  expect(await screen.findByText('Hãy khai trình độ đánh đơn trước khi tạo kèo xếp hạng đánh đơn.')).toBeInTheDocument()
  expect(createMatch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Đánh đôi', { exact: true }))
  expect(screen.queryByText(/Bạn chưa khai trình độ/)).not.toBeInTheDocument()
})
