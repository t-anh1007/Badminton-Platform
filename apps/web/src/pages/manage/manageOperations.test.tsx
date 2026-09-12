import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ManageIncidentsPage } from './ManageIncidentsPage.js'
import { ManageFinancePage } from './ManageFinancePage.js'
import { createWithdrawal, getMyRevenue } from '../../lib/financeApi.js'
vi.mock('../../lib/financeApi.js', () => ({ getMyWallets: vi.fn().mockResolvedValue([{ id: 'bw', walletType: 'business', available: '500000', pending: '100000', reserved: '50000', currency: 'VND' }]), getWalletLedger: vi.fn().mockResolvedValue({ wallet: { id: 'bw', walletType: 'business', available: '500000', pending: '100000', reserved: '50000', currency: 'VND' }, entries: Array.from({ length: 7 }, (_, index) => ({ id: `ledger-${index}`, amount: '10000', type: 'release', refType: 'booking', refId: `booking-${index}`, before: '0', after: '10000', ts: `2026-09-10T0${index}:00:00.000Z` })) }), getMyRevenue: vi.fn().mockResolvedValue([{ bookingId: 'booking-1', venueId: 'v1', gross: '1000000', net: '900000', commission: '100000', releaseAt: '2026-08-20T00:00:00Z', releasedAt: null, disputeOpen: false }]), getMyWithdrawals: vi.fn().mockResolvedValue([{ id: 'withdrawal-1', sellerUserId: 'owner', amount: '100000', paidAmount: '0', status: 'rejected', transferCode: 'WD1', bankCode: 'VCB', bankAccountNumber: '123', bankAccountName: 'A', rejectionReason: 'Sai thông tin tài khoản', createdAt: '2026-09-10T08:00:00.000Z', processedAt: '2026-09-10T09:00:00.000Z' }]), createWithdrawal: vi.fn().mockResolvedValue({ transferCode: 'WD123' }), cancelMyWithdrawal: vi.fn().mockResolvedValue({}), streamMyFinance: vi.fn().mockImplementation(() => new Promise(() => {})) }))
vi.mock('../../lib/venueBookingApi.js', () => ({
  getMyManagedVenues: vi.fn().mockResolvedValue([{ id: 'v1', name: 'Sân A', courts: [{ id: 'c1', name: 'Sân 1' }] }]),
  getVenueCalendar: vi.fn().mockResolvedValue({ courts: [{ id: 'c1', name: 'Sân 1' }], entries: [{ id: 'b1', courtId: 'c1', kind: 'booking', startAt: '2026-08-15T08:00:00Z', endAt: '2026-08-15T09:00:00Z' }] }),
  createInternalBooking: vi.fn().mockResolvedValue({}), cancelInternalBooking: vi.fn().mockResolvedValue({}), getReplacementCourts: vi.fn().mockResolvedValue({ courts: [{ id: 'c2', name: 'Sân 2' }] }), changeBookingCourt: vi.fn().mockResolvedValue({}), cancelProviderBooking: vi.fn().mockResolvedValue({}),
}))
it('loads replacement choices and requires a provider-fault reason before cancellation', async () => {
  const api = await import('../../lib/venueBookingApi.js')
  render(<ManageIncidentsPage />)
  const select = await screen.findByLabelText('Booking đã chọn'); await screen.findByRole('option', { name: /–/ }); fireEvent.change(select, { target: { value: 'b1' } }); fireEvent.click(screen.getByRole('button', { name: 'Tải sân thay thế' }))
  await waitFor(() => expect(api.getReplacementCourts).toHaveBeenCalledWith('b1'))
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' })); fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đổi sân' })); await waitFor(() => expect(api.changeBookingCourt).toHaveBeenCalledWith('b1', 'c2'))
  fireEvent.click(screen.getByRole('button', { name: 'Hủy do lỗi phía sân' })); fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' })); expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Lý do lỗi phía sân'), { target: { value: 'Mưa lớn' } }); fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' })); fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy booking' })); await waitFor(() => expect(api.cancelProviderBooking).toHaveBeenCalledWith('b1', 'Mưa lớn'))
})
it('shows today’s owner snapshot and creates a withdrawal from the single primary action', async () => {
  render(<ManageFinancePage />); await screen.findByText('Số dư có thể rút')
  expect(getMyRevenue).toHaveBeenCalledWith(expect.objectContaining({ from: expect.stringContaining('+07:00'), to: expect.stringContaining('+07:00') }))
  expect(screen.getByText('Yêu cầu rút tiền bị từ chối')).toBeVisible()
  expect(screen.getByText(/Tiền đã hoàn vào số dư khả dụng/)).toBeVisible()
  expect(screen.getByText('Trang 1 / 2')).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'Trang sau' })); expect(screen.getByText('Trang 2 / 2')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Rút tiền' })); expect(screen.getByRole('dialog')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận yêu cầu rút' })); expect(screen.getByRole('alert')).toHaveTextContent(/Nhập đủ thông tin/i)
  for (const [label, value] of [['Số tiền rút','10000'],['Mã ngân hàng','VCB'],['Số tài khoản nhận','123'],['Tên chủ tài khoản','A']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận yêu cầu rút' })); await waitFor(() => expect(createWithdrawal).toHaveBeenCalledWith(expect.objectContaining({ amount: '10000' })))
})
