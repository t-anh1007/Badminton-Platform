import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { SessionProvider } from '../session/SessionProvider.js'
import { Navbar } from './Navbar.js'

const accessToken = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJwMSJ9.'
vi.mock('../lib/accountApi.js', () => ({
  refreshSession: vi.fn().mockResolvedValue({ accessToken: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJwMSJ9.', refreshToken: 'refresh', roles: ['player'] }),
  getMyProfile: vi.fn().mockResolvedValue({ id: 'p1', email: 'player@example.com', phone: null, roles: ['player'], playerProfile: { displayName: 'Người chơi', avatarUrl: null, visibility: 'public' } }),
  logout: vi.fn().mockResolvedValue({ message: 'ok' }),
}))

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('courtin.session', JSON.stringify({ userId: 'p1', accessToken, refreshToken: 'refresh', roles: ['player'], activeRole: 'player' }))
})

it('exposes the provider partnership CTA inside the account menu', async () => {
  render(<MemoryRouter><SessionProvider><Navbar onOpenAuth={vi.fn()} /></SessionProvider></MemoryRouter>)
  await userEvent.click(await screen.findByRole('button', { name: 'Menu tài khoản' }))
  const link = screen.getByRole('menuitem', { name: 'Hợp tác chủ sân' })
  expect(link).toHaveAttribute('href', '/provider-onboarding')
})
