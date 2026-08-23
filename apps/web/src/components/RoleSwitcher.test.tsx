import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { refreshSession } from '../lib/accountApi.js'
import { SessionProvider } from '../session/SessionProvider.js'
import { RoleSwitcher } from './RoleSwitcher.js'

// SessionProvider refreshes a persisted session on hydration before rendering
// children; mock the network refresh so the two-role session becomes available.
vi.mock('../lib/accountApi.js', () => ({ refreshSession: vi.fn(), logout: vi.fn() }))

function LocationProbe() { return <output>{useLocation().pathname}</output> }
const token = `x.${btoa(JSON.stringify({ sub: 'p1' }))}.x`
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('courtin.session', JSON.stringify({ userId: 'p1', accessToken: token, refreshToken: 'refresh', roles: ['player', 'provider'], activeRole: 'player' }))
  vi.mocked(refreshSession).mockReset()
  vi.mocked(refreshSession).mockResolvedValue({ accessToken: token, refreshToken: 'refresh', roles: ['player', 'provider'] })
})

it('visibly switches role context and navigates to its home', async () => {
  render(<MemoryRouter initialEntries={['/']}><SessionProvider><RoleSwitcher /><Routes><Route path="*" element={<LocationProbe />} /></Routes></SessionProvider></MemoryRouter>)
  const select = await screen.findByRole('combobox', { name: 'Ngữ cảnh tài khoản' })
  expect(select).toBeVisible()
  fireEvent.change(select, { target: { value: 'provider' } })
  expect(screen.getByText('/manage')).toBeInTheDocument()
  expect(localStorage.getItem('courtin.activeRole')).toBe('provider')
})
