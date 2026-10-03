import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminAccountsPage } from './AdminAccountsPage.js'
import { AdminProvidersPage } from './AdminProvidersPage.js'
import { AdminBookingsPage } from './AdminBookingsPage.js'
import { getAdminAccounts, lockAdminAccount, unlockAdminAccount } from '../../lib/accountApi.js'
import { cancelAdminBooking, getAdminBookings, getOperationalShutdown, rejectProvider } from '../../lib/venueBookingApi.js'

vi.mock('../../lib/accountApi.js', () => ({ getAdminAccounts: vi.fn().mockResolvedValue([{ id: 'u1', email: 'player@example.com', displayName: 'Người chơi A', status: 'active', roles: ['player'] }]), lockAdminAccount: vi.fn().mockResolvedValue({}), unlockAdminAccount: vi.fn().mockResolvedValue({}) }))
vi.mock('../../lib/venueBookingApi.js', () => ({ getAdminProviders: vi.fn().mockResolvedValue([{ id: 'p1', userId: 'user-internal-id', orgName: 'Nhà sân A', status: 'pending' }]), approveProvider: vi.fn().mockResolvedValue({}), rejectProvider: vi.fn().mockResolvedValue({}), getAdminBookings: vi.fn().mockResolvedValue({ items: [{ id: 'b1', businessCode: 'BK-00001001', status: 'confirmed', startAt: '2026-08-15T08:00:00Z', endAt: '2026-08-15T09:00:00Z', priceSnapshot: '180000', holdExpiresAt: null, matchDepositPaid: false, player: { label: 'Người chơi đã đăng nhập' }, court: { id: 'c1', name: 'Sân 1', venue: { id: 'v1', name: 'Nhà thi đấu A', address: 'Quận 1' } } }], total: 1, page: 1, pageSize: 20 }), getOperationalShutdown: vi.fn().mockResolvedValue(null), cancelAdminBooking: vi.fn().mockResolvedValue({}) }))
vi.mock('../../lib/systemHealthApi.js', () => ({ getSystemHealth: vi.fn().mockResolvedValue([{ key: 'account', label: 'Tài khoản', state: 'available' }, { key: 'finance', label: 'Tài chính', state: 'degraded' }, { key: 'community', label: 'Cộng đồng', state: 'unreachable' }]) }))
afterEach(cleanup)

it('locks an account only after an explicit reason', async () => {
  render(<AdminAccountsPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Khóa tài khoản' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  expect(screen.getByRole('status')).toHaveTextContent('Nhập lý do')
  fireEvent.change(screen.getByLabelText('Lý do thao tác tài khoản'), { target: { value: 'Vi phạm điều khoản' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(lockAdminAccount).toHaveBeenCalledWith('u1', 'Vi phạm điều khoản'))
})

it('unlocks a locked account only after an explicit reason', async () => {
  vi.mocked(getAdminAccounts).mockResolvedValueOnce([{ id: 'u2', email: 'locked@example.com', displayName: 'Người chơi B', status: 'locked', roles: ['player'] }])
  render(<AdminAccountsPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Mở khóa' }))
  fireEvent.change(screen.getByLabelText('Lý do thao tác tài khoản'), { target: { value: 'Đã xác minh lại' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(unlockAdminAccount).toHaveBeenCalledWith('u2', 'Đã xác minh lại'))
})

it('validates a provider rejection reason and reloads its queue', async () => {
  render(<AdminProvidersPage />)
  expect(await screen.findByText('Nhà sân A')).toBeInTheDocument()
  expect(screen.queryByText('User ID')).not.toBeInTheDocument()
  expect(screen.queryByText('user-internal-id')).not.toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: 'Từ chối' }))
  fireEvent.change(screen.getByLabelText('Lý do từ chối chủ sân'), { target: { value: 'Thiếu giấy tờ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận quyết định' }))
  await waitFor(() => expect(rejectProvider).toHaveBeenCalledWith('p1', 'Thiếu giấy tờ'))
})

it('cancels a displayed booking without exposing its raw id as the label', async () => {
  render(<AdminBookingsPage />)
  expect(await screen.findByText('Nhà thi đấu A · Sân 1')).toBeInTheDocument()
  expect(screen.getByText('Người chơi đã đăng nhập')).toBeInTheDocument()
  expect(screen.queryByText('b1')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hủy do lỗi nền tảng' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }))
  expect(screen.getByRole('status')).toHaveTextContent('Nhập lý do')
  expect(cancelAdminBooking).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Lý do hủy lượt đặt sân'), { target: { value: 'Sự cố nền tảng' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }))
  await waitFor(() => expect(cancelAdminBooking).toHaveBeenCalledWith('b1', 'Sự cố nền tảng'))
})

it('lets Admin open the same shutdown flow for the exact court or venue', async () => {
  render(<AdminBookingsPage />)
  await screen.findByText('Nhà thi đấu A · Sân 1')
  fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Chi tiết lượt đặt sân' })).getByRole('button', { name: 'Ngừng hoạt động sân' }))

  expect(await screen.findByRole('dialog', { name: 'Ngừng hoạt động · Sân 1' })).toBeInTheDocument()
  expect(getOperationalShutdown).toHaveBeenCalledWith('court', 'c1')
})

it('sends all selected booking filters to the admin queue', async () => {
  render(<AdminBookingsPage />)
  await screen.findByText('Nhà thi đấu A · Sân 1')
  fireEvent.change(screen.getByLabelText('Tìm lượt đặt sân'), { target: { value: 'Phú Nhuận' } })
  fireEvent.change(screen.getByLabelText('Trạng thái lượt đặt sân'), { target: { value: 'confirmed' } })
  fireEvent.change(screen.getByLabelText('Từ ngày lượt đặt sân'), { target: { value: '2026-08-15' } })
  fireEvent.change(screen.getByLabelText('Đến ngày lượt đặt sân'), { target: { value: '2026-08-16' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lọc' }))
  await waitFor(() => expect(getAdminBookings).toHaveBeenLastCalledWith({ query: 'Phú Nhuận', status: 'confirmed', from: '2026-08-15', to: '2026-08-16', page: 1, pageSize: 20 }))
})
