import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { SessionProvider } from '../session/SessionProvider.js'
import { getMyProvider, registerProvider } from '../lib/venueBookingApi.js'
import { ProviderOnboardingPage } from './ProviderOnboardingPage.js'

vi.mock('../lib/venueBookingApi.js', () => ({ getMyProvider: vi.fn(), registerProvider: vi.fn() }))
vi.mock('../lib/accountApi.js', () => ({ refreshSession: vi.fn().mockRejectedValue(new Error('stale')), logout: vi.fn() }))
beforeEach(() => { localStorage.clear(); localStorage.setItem('courtin.session', JSON.stringify({ userId: 'p1', accessToken: 'token', refreshToken: 'refresh', roles: ['player'], activeRole: 'player' })) })

it('submits a new provider application and renders rejected recovery plus approved role refresh', async () => {
  vi.mocked(getMyProvider).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'p', orgName: 'Sân A', contact: { phone: '0901' }, status: 'rejected', decisionReason: 'Bổ sung giấy tờ', decidedAt: '2026-08-15T08:00:00Z' }).mockResolvedValueOnce({ id: 'p', orgName: 'Sân A', contact: {}, status: 'approved', decisionReason: null, decidedAt: '2026-08-15T08:00:00Z' })
  vi.mocked(registerProvider).mockResolvedValue({ id: 'p', orgName: 'Sân A', contact: {}, status: 'pending', decisionReason: null, decidedAt: null })
  render(<MemoryRouter><SessionProvider><ProviderOnboardingPage /></SessionProvider></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Hợp tác chủ sân' })
  fireEvent.change(screen.getByLabelText('Tên tổ chức'), { target: { value: 'Sân A' } })
  fireEvent.change(screen.getByLabelText('Liên hệ'), { target: { value: '0901' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi hồ sơ' }))
  await waitFor(() => expect(registerProvider).toHaveBeenCalledWith({ orgName: 'Sân A', contact: { contact: '0901' } }))
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại trạng thái' }))
  expect(await screen.findByText('Bổ sung giấy tờ')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Nộp lại hồ sơ' }))
  fireEvent.change(screen.getByLabelText('Tên tổ chức'), { target: { value: 'Sân A đã bổ sung' } })
  fireEvent.change(screen.getByLabelText('Liên hệ'), { target: { value: '0901000000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi hồ sơ' }))
  await waitFor(() => expect(registerProvider).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại trạng thái' }))
  expect(await screen.findByRole('button', { name: 'Làm mới phiên để chuyển vai trò' })).toBeInTheDocument()
})
