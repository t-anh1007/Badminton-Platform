import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ManageCalendarPage } from './ManageCalendarPage.js'
import { ManageIncidentsPage } from './ManageIncidentsPage.js'
import { ManageFinancePage } from './ManageFinancePage.js'
import { cancelMyWithdrawal, createWithdrawal, getMyRevenue, getMyWithdrawals } from '../../lib/financeApi.js'
vi.mock('../../lib/financeApi.js', () => ({ getMyWallets: vi.fn().mockResolvedValue([{ id: 'bw', walletType: 'business', available: '500000', pending: '100000', reserved: '50000', currency: 'VND' }]), getWalletLedger: vi.fn().mockResolvedValue({ wallet: { id: 'bw', walletType: 'business', available: '500000', pending: '100000', reserved: '50000', currency: 'VND' }, entries: [] }), getMyRevenue: vi.fn().mockResolvedValue([{ bookingId: 'booking-1', venueId: 'v1', gross: '1000000', net: '900000', commission: '100000', releaseAt: '2026-08-20T00:00:00Z', releasedAt: null, disputeOpen: false }]), getMyWithdrawals: vi.fn().mockResolvedValue([]), createWithdrawal: vi.fn().mockResolvedValue({ transferCode: 'WD123' }), cancelMyWithdrawal: vi.fn().mockResolvedValue({}) }))
import { cancelInternalBooking, createInternalBooking, getVenueCalendar } from '../../lib/venueBookingApi.js'

vi.mock('../../lib/venueBookingApi.js', () => ({
  getMyManagedVenues: vi.fn().mockResolvedValue([{ id: 'v1', name: 'Sân A', courts: [{ id: 'c1', name: 'Sân 1' }] }]),
  getVenueCalendar: vi.fn().mockResolvedValue({ courts: [{ id: 'c1', name: 'Sân 1' }], entries: [{ id: 'b1', courtId: 'c1', kind: 'booking', startAt: '2026-08-15T08:00:00Z', endAt: '2026-08-15T09:00:00Z' }] }),
  createInternalBooking: vi.fn().mockResolvedValue({}), cancelInternalBooking: vi.fn().mockResolvedValue({}), getReplacementCourts: vi.fn().mockResolvedValue({ courts: [{ id: 'c2', name: 'Sân 2' }] }), changeBookingCourt: vi.fn().mockResolvedValue({}), cancelProviderBooking: vi.fn().mockResolvedValue({}),
}))
it('loads a venue date, creates a walk-in once, and cancels an owner-context entry', async () => {
  render(<ManageCalendarPage />)
  const date = await screen.findByLabelText(/ngày lịch/i); fireEvent.change(date, { target: { value: '15/08/2026' } }); fireEvent.blur(date)
  await waitFor(() => expect(getVenueCalendar).toHaveBeenCalledWith('v1', '2026-08-15'))
  for (const [label, value] of [['Tên khách', 'A'], ['Liên hệ khách', '09'], ['Bắt đầu', '2026-08-15T08:00:00Z'], ['Kết thúc', '2026-08-15T09:00:00Z']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  const create = screen.getByRole('button', { name: /tạo booking/i }); fireEvent.click(create); expect(create).toBeDisabled()
  await waitFor(() => expect(createInternalBooking).toHaveBeenCalledWith(expect.objectContaining({ courtId: 'c1', guestName: 'A' })))
  fireEvent.click(screen.getByRole('button', { name: 'Hủy' })); await waitFor(() => expect(cancelInternalBooking).toHaveBeenCalledWith('b1'))
})
it('loads replacement choices and requires a provider-fault reason before cancellation', async () => {
  const api = await import('../../lib/venueBookingApi.js')
  render(<ManageIncidentsPage />)
  const select = await screen.findByLabelText('Booking đã chọn'); await screen.findByRole('option', { name: /–/ }); fireEvent.change(select, { target: { value: 'b1' } }); fireEvent.click(screen.getByRole('button', { name: 'Tải sân thay thế' }))
  await waitFor(() => expect(api.getReplacementCourts).toHaveBeenCalledWith('b1'))
  expect(screen.getByRole('button', { name: 'Hủy do lỗi phía sân' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Lý do lỗi phía sân'), { target: { value: 'Mưa lớn' } }); fireEvent.click(screen.getByRole('button', { name: 'Đổi sân' })); await waitFor(() => expect(api.changeBookingCourt).toHaveBeenCalledWith('b1', 'c2'))
  fireEvent.click(screen.getByRole('button', { name: 'Hủy do lỗi phía sân' })); await waitFor(() => expect(api.cancelProviderBooking).toHaveBeenCalledWith('b1', 'Mưa lớn'))
})
it('filters revenue by venue and validates/creates a provider withdrawal', async () => {
  render(<ManageFinancePage />); await screen.findByText(/Đang chờ 24 giờ/)
  fireEvent.change(screen.getByLabelText('Lọc cơ sở'), { target: { value: 'v1' } }); fireEvent.click(screen.getByRole('button', { name: 'Lọc doanh thu' })); await waitFor(() => expect(getMyRevenue).toHaveBeenLastCalledWith(expect.objectContaining({ venueId: 'v1' })))
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu rút' })); expect(screen.getByRole('alert')).toHaveTextContent(/thông tin ngân hàng/i)
  for (const [label, value] of [['Số tiền rút','100000'],['Mã ngân hàng','VCB'],['Số tài khoản nhận','123'],['Tên chủ tài khoản','A']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  const submit = screen.getByRole('button', { name: 'Gửi yêu cầu rút' }); fireEvent.click(submit); expect(submit).toBeDisabled(); await waitFor(() => expect(createWithdrawal).toHaveBeenCalledTimes(1))
})
it('cancels a pending provider withdrawal', async () => {
  vi.mocked(getMyWithdrawals).mockResolvedValueOnce([{ id: 'w1', sellerUserId: 's', amount: '200000', paidAmount: '0', status: 'pending', transferCode: 'WD1', bankCode: 'VCB', bankAccountNumber: '123', bankAccountName: 'A' }])
  render(<ManageFinancePage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Hủy yêu cầu' })); await waitFor(() => expect(cancelMyWithdrawal).toHaveBeenCalledWith('w1'))
})
