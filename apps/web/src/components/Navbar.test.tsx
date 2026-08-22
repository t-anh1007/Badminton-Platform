import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { SessionProvider } from '../session/SessionProvider.js'
import { Navbar } from './Navbar.js'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('courtin.session', JSON.stringify({ userId: 'p1', accessToken: 'token', refreshToken: 'refresh', roles: ['player'], activeRole: 'player' }))
})

it('exposes the provider partnership CTA inside the account menu', async () => {
  render(<MemoryRouter><SessionProvider><Navbar onOpenAuth={vi.fn()} /></SessionProvider></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: 'Menu tài khoản' }))
  const link = screen.getByRole('menuitem', { name: 'Hợp tác chủ sân' })
  expect(link).toHaveAttribute('href', '/provider-onboarding')
})
