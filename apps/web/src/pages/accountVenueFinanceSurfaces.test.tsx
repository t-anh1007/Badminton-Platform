import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProfilePage } from './ProfilePage.js'
import { VenueListPage } from './VenueListPage.js'
import { DisputePanel } from '../components/DisputePanel.js'
import { AuthForm } from '../components/AuthForm.js'
import { ResetPasswordPage } from './ResetPasswordPage.js'
import { SessionProvider } from '../session/SessionProvider.js'
import { createTopupIntent, createDispute } from '../lib/financeApi.js'
import { authorizeAvatarUpload, changePassword, commitAvatarUpload, register, requestPasswordReset, resendVerificationEmail, resetPassword, updateMyProfile, uploadAvatarFile, verifyEmail } from '../lib/accountApi.js'
import { searchVenues } from '../lib/venueBookingApi.js'

vi.mock('../lib/accountApi.js', () => ({
  getMyProfile: vi.fn().mockResolvedValue({ id: 'u1', email: 'player@example.com', phone: '0900000000', roles: ['player', 'provider'], playerProfile: { displayName: 'Người chơi A', avatarUrl: 'https://cdn.example/avatar.webp', visibility: 'public' } }),
  updateMyProfile: vi.fn().mockResolvedValue({}), changePassword: vi.fn().mockResolvedValue({}),
  authorizeAvatarUpload: vi.fn().mockResolvedValue({ objectKey: 'profile/avatars/u1/new.webp', uploadUrl: 'https://storage.test/put', headers: {}, expiresAt: 'x' }),
  uploadAvatarFile: vi.fn().mockResolvedValue(undefined),
  commitAvatarUpload: vi.fn().mockResolvedValue({ id: 'u1', email: 'player@example.com', phone: '0900000000', roles: ['player', 'provider'], playerProfile: { displayName: 'Người chơi A', avatarUrl: 'https://cdn.example/new.webp', visibility: 'public' } }),
  register: vi.fn().mockResolvedValue({ message: 'Đã gửi mã' }), verifyEmail: vi.fn().mockResolvedValue({ message: 'Đã xác minh' }), resendVerificationEmail: vi.fn().mockResolvedValue({ message: 'Đã gửi lại' }),
  login: vi.fn(), refreshSession: vi.fn(), logout: vi.fn(), requestPasswordReset: vi.fn().mockResolvedValue({ message: 'Đã gửi liên kết' }), resetPassword: vi.fn().mockResolvedValue({ message: 'Đã đổi mật khẩu' }),
}))
vi.mock('../lib/financeApi.js', () => ({
  getMyWallets: vi.fn().mockResolvedValue([{ id: 'wallet-safe', walletType: 'personal', available: '140000', pending: '0', reserved: '0', currency: 'VND' }]),
  getWalletLedger: vi.fn().mockResolvedValue({ wallet: {}, entries: [] }),
  createTopupIntent: vi.fn().mockResolvedValue({ intentId: 'must-not-render', matchCode: 'KLTABC123', amount: '100000', payment: { bankCode: 'MBBank', accountNumber: '0123456789', accountName: 'CAU LONG PLATFORM', amount: '100000', matchCode: 'KLTABC123', qrImageUrl: 'https://qr.sepay.vn/img?acc=0123456789&bank=MBBank&amount=100000&des=KLTABC123' } }),
  getEligibleDisputeBookings: vi.fn().mockResolvedValue([{ bookingId: 'booking-must-not-render', venueId: 'venue-id', gross: '180000', endAt: '2026-08-15T09:00:00Z', deadlineAt: '2026-08-16T09:00:00Z' }]),
  getMyDisputes: vi.fn().mockResolvedValue([]), createDispute: vi.fn().mockResolvedValue({}),
}))
vi.mock('../lib/venueBookingApi.js', () => ({
  getMyUpcomingBookings: vi.fn().mockResolvedValue([]), getMyBookingHistory: vi.fn().mockResolvedValue([]),
  searchVenues: vi.fn().mockResolvedValue([]),
}))

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shows account roles/avatar and updates all editable profile fields', async () => {
  render(<MemoryRouter initialEntries={['/profile']}><ProfilePage /></MemoryRouter>)
  expect(await screen.findByAltText('Ảnh đại diện tài khoản')).toHaveAttribute('src', 'https://cdn.example/avatar.webp')
  expect(screen.getByText('Người chơi')).toBeInTheDocument()
  expect(screen.getByText('Chủ sân')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Đổi ảnh đại diện'), { target: { files: [new File(['avatar'], 'avatar.webp', { type: 'image/webp' })] } })
  await waitFor(() => expect(authorizeAvatarUpload).toHaveBeenCalledWith('image/webp'))
  expect(uploadAvatarFile).toHaveBeenCalled()
  await waitFor(() => expect(commitAvatarUpload).toHaveBeenCalledWith('profile/avatars/u1/new.webp', 'image/webp'))
  fireEvent.click(screen.getByRole('button', { name: 'Cập nhật thông tin' }))
  fireEvent.change(screen.getByLabelText('Tên hiển thị'), { target: { value: 'Tên mới' } })
  fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0911111111' } })
  fireEvent.change(screen.getByLabelText('Hiển thị'), { target: { value: 'private' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
  await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ displayName: 'Tên mới', phone: '0911111111', visibility: 'private' }))
  fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
  fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), { target: { value: 'OldPassword1' } })
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'NewPassword1' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đổi mật khẩu' }))
  await waitFor(() => expect(changePassword).toHaveBeenCalledWith({ currentPassword: 'OldPassword1', newPassword: 'NewPassword1', currentRefreshToken: undefined }))
})

it('supports registration, verification and resend without losing the email', async () => {
  render(<MemoryRouter><SessionProvider><AuthForm initialMode="register" /></SessionProvider></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Tên hiển thị'), { target: { value: 'Người chơi mới' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Password1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))
  await waitFor(() => expect(register).toHaveBeenCalledWith({ email: 'new@example.com', password: 'Password1', displayName: 'Người chơi mới' }))
  fireEvent.click(screen.getByRole('button', { name: 'Gửi lại email xác minh' }))
  await waitFor(() => expect(resendVerificationEmail).toHaveBeenCalledWith('new@example.com'))
  fireEvent.change(screen.getByLabelText('Mã xác minh'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác minh email' }))
  await waitFor(() => expect(verifyEmail).toHaveBeenCalledWith({ email: 'new@example.com', code: '123456' }))
})

it('supports forgot and token-based reset password surfaces', async () => {
  const first = render(<MemoryRouter initialEntries={['/reset-password']}><ResetPasswordPage /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'player@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi liên kết' }))
  await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith('player@example.com'))
  first.unmount()

  render(<MemoryRouter initialEntries={['/reset-password?token=safe-reset-token']}><ResetPasswordPage /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'NewPassword1' } })
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: 'NewPassword1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }))
  await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({ token: 'safe-reset-token', newPassword: 'NewPassword1' }))
})

it('renders a safe top-up instruction with copy action and no intent UUID', async () => {
  render(<MemoryRouter initialEntries={['/profile?tab=wallet']}><ProfilePage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Nạp tiền bằng SePay' }))
  fireEvent.click(screen.getByRole('button', { name: 'Tạo mã chuyển khoản' }))
  expect(await screen.findByText('KLTABC123')).toBeInTheDocument()
  expect(screen.queryByText('must-not-render')).not.toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Chép' })[1]!)
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('KLTABC123'))
  expect(createTopupIntent).toHaveBeenCalledWith('100000')
})

it('ignores radius in list view and only applies it in map view', async () => {
  render(<MemoryRouter initialEntries={['/venues']}><VenueListPage /></MemoryRouter>)
  await waitFor(() => expect(searchVenues).toHaveBeenCalledWith(expect.not.objectContaining({ radiusKm: expect.anything() })))
  fireEvent.click(screen.getByRole('button', { name: /hiện bộ lọc/i }))
  fireEvent.change(screen.getByLabelText('Bán kính'), { target: { value: '20' } })
  fireEvent.change(screen.getByLabelText('Giá tối thiểu (nhập tay)'), { target: { value: '100000' } })
  fireEvent.change(screen.getByLabelText('Giá tối đa (nhập tay)'), { target: { value: '250000' } })
  fireEvent.change(screen.getByLabelText('Sắp xếp'), { target: { value: 'price' } })
  fireEvent.change(screen.getByLabelText('Ngày chơi'), { target: { value: '2026-08-15' } })
  fireEvent.change(screen.getByLabelText('Giờ bắt đầu'), { target: { value: '08:00' } })
  fireEvent.change(screen.getByLabelText('Giờ kết thúc'), { target: { value: '10:30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tìm sân' }))
  await waitFor(() => expect(searchVenues).toHaveBeenLastCalledWith(expect.objectContaining({ minPrice: 100000, maxPrice: 250000, sortBy: 'price', date: '2026-08-15', startMinute: 480, endMinute: 630 })))
  expect(searchVenues).toHaveBeenLastCalledWith(expect.not.objectContaining({ radiusKm: expect.anything() }))

  fireEvent.click(screen.getByRole('tab', { name: 'Bản đồ' }))
  await waitFor(() => expect(searchVenues).toHaveBeenLastCalledWith(expect.objectContaining({ radiusKm: 20 })))
})

it('creates a dispute from a business label without exposing booking UUID text', async () => {
  render(<DisputePanel />)
  expect(await screen.findByRole('option', { name: /Ca kết thúc/ })).toBeInTheDocument()
  expect(screen.queryByText(/booking-must-not-render/)).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Lý do tranh chấp'), { target: { value: 'Sân đóng cửa' } })
  fireEvent.change(screen.getByLabelText('Bằng chứng'), { target: { value: 'https://evidence.example/photo' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi tranh chấp' }))
  await waitFor(() => expect(createDispute).toHaveBeenCalledWith({ bookingId: 'booking-must-not-render', reason: 'Sân đóng cửa', evidence: ['https://evidence.example/photo'] }))
})
