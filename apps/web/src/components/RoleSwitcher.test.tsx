import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, expect, it } from 'vitest'
import { SessionProvider } from '../session/SessionProvider.js'
import { RoleSwitcher } from './RoleSwitcher.js'

function LocationProbe() { return <output>{useLocation().pathname}</output> }
const token = `x.${btoa(JSON.stringify({ sub: 'p1' }))}.x`
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('courtin.session', JSON.stringify({ userId: 'p1', accessToken: token, refreshToken: 'refresh', roles: ['player', 'provider'], activeRole: 'player' }))
})

it('visibly switches role context and navigates to its home', () => {
  render(<MemoryRouter initialEntries={['/']}><SessionProvider><RoleSwitcher /><Routes><Route path="*" element={<LocationProbe />} /></Routes></SessionProvider></MemoryRouter>)
  const select = screen.getByRole('combobox', { name: 'Ngữ cảnh tài khoản' })
  expect(select).toBeVisible()
  fireEvent.change(select, { target: { value: 'provider' } })
  expect(screen.getByText('/manage')).toBeInTheDocument()
  expect(localStorage.getItem('courtin.activeRole')).toBe('provider')
})
