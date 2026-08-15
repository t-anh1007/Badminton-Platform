import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it } from 'vitest'
import { SessionProvider } from '../session/SessionProvider.js'
import { RoleGuard } from './RoleGuard.js'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('courtin.session', JSON.stringify({ userId: 'p1', accessToken: 'token', refreshToken: 'refresh', roles: ['player'], activeRole: 'player' }))
})

it('renders a Vietnamese recovery state for a forbidden role context', () => {
  render(<MemoryRouter initialEntries={['/manage']}><SessionProvider><Routes><Route element={<RoleGuard allow={['provider']} />}><Route path="/manage" element={<p>Provider home</p>} /></Route></Routes></SessionProvider></MemoryRouter>)
  expect(screen.getByRole('heading', { name: /chưa có quyền/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/')
})
