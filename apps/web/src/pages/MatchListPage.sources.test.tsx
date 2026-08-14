import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { MatchListPage } from './MatchListPage.js'
import { createMatch } from '../lib/matchApi.js'
import { getMyMatchSources } from '../lib/venueBookingApi.js'

vi.mock('../components/QuickMatchPanel.js', () => ({ QuickMatchPanel: () => null }))
vi.mock('../lib/matchApi.js', () => ({
  listMatches: vi.fn().mockResolvedValue({ matches: [] }),
  getMatchDetail: vi.fn(),
  createMatch: vi.fn().mockResolvedValue({ id: 'm1' }),
}))
vi.mock('../lib/venueBookingApi.js', () => ({ getMyMatchSources: vi.fn() }))

beforeEach(() => {
  localStorage.setItem('accessToken', 'token')
  vi.mocked(getMyMatchSources).mockResolvedValue({
    holds: [{ id: 'h1', startAt: '2026-08-15T08:00:00Z', endAt: '2026-08-15T09:00:00Z', expiresAt: '2026-08-14T10:00:00Z', court: { id: 'c1', name: 'Sân 1', venue: { id: 'v1', name: 'Nhà thi đấu A', address: 'Q1' } } }],
    bookings: [],
  })
})

it('creates from an eligible source without exposing its raw id', async () => {
  render(<MemoryRouter><MatchListPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Tạo kèo từ slot/i }))
  expect(await screen.findByRole('option', { name: /Nhà thi đấu A · Sân 1/ })).toBeInTheDocument()
  expect(screen.queryByText('h1')).not.toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tạo kèo' }))
  await waitFor(() => expect(createMatch).toHaveBeenCalledWith({ holdId: 'h1', capacity: 4, feeMode: 'split' }))
})
