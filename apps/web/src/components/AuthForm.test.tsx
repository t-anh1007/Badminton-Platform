import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AccountApiError, login } from '../lib/accountApi.js'
import { SessionProvider, useSession } from '../session/SessionProvider.js'
import { AuthForm } from './AuthForm.js'

vi.mock('../lib/accountApi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/accountApi.js')>()
  return {
    AccountApiError: actual.AccountApiError,
    login: vi.fn(), register: vi.fn(), resendVerificationEmail: vi.fn(), verifyEmail: vi.fn(),
    refreshSession: vi.fn(), logout: vi.fn(),
  }
})

const token = (sub: string) => `x.${btoa(JSON.stringify({ sub }))}.x`
function SessionProbe() { const { session } = useSession(); return <output>{session?.userId ?? 'anonymous'}</output> }

beforeEach(() => localStorage.clear())
afterEach(cleanup)

it('updates the shared session immediately after login', async () => {
  vi.mocked(login).mockResolvedValue({ accessToken: token('player-1'), refreshToken: 'refresh', roles: ['player'] })
  render(<MemoryRouter><SessionProvider><AuthForm /><SessionProbe /></SessionProvider></MemoryRouter>)
  fireEvent.change(screen.getByPlaceholderText('ban@vidu.com'), { target: { value: 'player@example.com' } })
  fireEvent.change(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), { target: { value: 'Password1' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Đăng nhập' }).at(-1)!)
  await waitFor(() => expect(screen.getByText('player-1')).toBeInTheDocument())
})

function submitLogin(email: string) {
  render(<MemoryRouter><SessionProvider><AuthForm /></SessionProvider></MemoryRouter>)
  fireEvent.change(screen.getByPlaceholderText('ban@vidu.com'), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), { target: { value: 'Password1' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Đăng nhập' }).at(-1)!)
}

it('moves an unverified login to email verification with the same email (AC-ACC-03-2)', async () => {
  vi.mocked(login).mockRejectedValue(new AccountApiError('Tài khoản chưa xác minh email.', 403, 'EMAIL_NOT_VERIFIED'))
  submitLogin('pending@example.com')
  expect(await screen.findByRole('heading', { name: 'Xác minh email' })).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Tài khoản chưa xác minh email.')
  expect(screen.getByPlaceholderText('ban@vidu.com')).toHaveValue('pending@example.com')
  expect(screen.getByPlaceholderText('6 chữ số')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Gửi lại email xác minh' })).toBeEnabled()
})

it('keeps other login failures on the login form', async () => {
  vi.mocked(login).mockRejectedValue(new AccountApiError('Email hoặc mật khẩu không đúng.', 401, 'INVALID_CREDENTIALS'))
  submitLogin('player@example.com')
  expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng.')
  expect(screen.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeInTheDocument()
})
