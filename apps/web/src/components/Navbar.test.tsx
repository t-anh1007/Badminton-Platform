import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { SessionProvider } from '../session/SessionProvider.js'
import { Navbar } from './Navbar.js'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('courtin.session', JSON.stringify({ userId: 'p1', accessToken: 'token', refreshToken: 'refresh', roles: ['player'], activeRole: 'player' }))
})

it('shows the provider partnership CTA at every viewport', () => {
  render(<MemoryRouter><SessionProvider><Navbar onOpenAuth={vi.fn()} /></SessionProvider></MemoryRouter>)
  const link = screen.getByRole('link', { name: 'Hợp tác chủ sân' })
  expect(link).toHaveAttribute('href', '/provider-onboarding')
  expect(link).not.toHaveClass('hidden')
})
