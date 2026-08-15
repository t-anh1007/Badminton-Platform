import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { login } from '../lib/accountApi.js'
import { SessionProvider, useSession } from '../session/SessionProvider.js'
import { AuthForm } from './AuthForm.js'

vi.mock('../lib/accountApi.js', () => ({
  login: vi.fn(), register: vi.fn(), resendVerificationEmail: vi.fn(), verifyEmail: vi.fn(),
  refreshSession: vi.fn(), logout: vi.fn(),
}))

const token = (sub: string) => `x.${btoa(JSON.stringify({ sub }))}.x`
function SessionProbe() { const { session } = useSession(); return <output>{session?.userId ?? 'anonymous'}</output> }

beforeEach(() => localStorage.clear())

it('updates the shared session immediately after login', async () => {
  vi.mocked(login).mockResolvedValue({ accessToken: token('player-1'), refreshToken: 'refresh', roles: ['player'] })
  render(<MemoryRouter><SessionProvider><AuthForm /><SessionProbe /></SessionProvider></MemoryRouter>)
  fireEvent.change(screen.getByPlaceholderText('ban@vidu.com'), { target: { value: 'player@example.com' } })
  fireEvent.change(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), { target: { value: 'Password1' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Đăng nhập' }).at(-1)!)
  await waitFor(() => expect(screen.getByText('player-1')).toBeInTheDocument())
})
