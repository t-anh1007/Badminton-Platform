import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { refreshSession } from '../lib/accountApi.js'
import { SessionProvider } from '../session/SessionProvider.js'
import { RoleGuard } from './RoleGuard.js'

// SessionProvider refreshes a persisted session on hydration before rendering
// children; mock it so the player session is available to the guard.
vi.mock('../lib/accountApi.js', () => ({ refreshSession: vi.fn(), logout: vi.fn() }))

const token = `x.${btoa(JSON.stringify({ sub: 'p1' }))}.x`
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('courtin.session', JSON.stringify({ userId: 'p1', accessToken: token, refreshToken: 'refresh', roles: ['player'], activeRole: 'player' }))
  vi.mocked(refreshSession).mockReset()
  vi.mocked(refreshSession).mockResolvedValue({ accessToken: token, refreshToken: 'refresh', roles: ['player'] })
})

it('renders a Vietnamese recovery state for a forbidden role context', async () => {
  render(<MemoryRouter initialEntries={['/manage']}><SessionProvider><Routes><Route element={<RoleGuard allow={['provider']} />}><Route path="/manage" element={<p>Provider home</p>} /></Route></Routes></SessionProvider></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: /chưa có quyền/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/')
})
