import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { listMatches } from '../lib/matchApi.js'
import { MatchListPage } from './MatchListPage.js'

vi.mock('../components/QuickMatchPanel.js', () => ({ QuickMatchPanel: () => null }))
vi.mock('../lib/matchApi.js', () => ({ listMatches: vi.fn(), getMatchDetail: vi.fn().mockRejectedValue(new Error('skip')), createMatch: vi.fn() }))
vi.mock('../lib/venueBookingApi.js', () => ({ getMyMatchSources: vi.fn() }))

const publicMatch = { id: 'm1', organizerUserId: 'u1', capacity: 2, openSlots: 1, feePerSlot: '60000', skillMin: null, skillMax: null, cutoffAt: '2026-08-24T00:00:00Z', startAt: '2026-08-25T01:00:00Z', endAt: '2026-08-25T02:00:00Z', court: { id: 'c1', name: 'Sân 1' }, venue: { id: 'v1', name: 'Sân A', address: 'Q1', lat: 0, lng: 0 } }

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => vi.useRealTimers())

it('announces and highlights the newly funded match', async () => {
  vi.mocked(listMatches).mockResolvedValue({ matches: [publicMatch] } as never)
  render(<MemoryRouter initialEntries={['/matches?created=m1']}><MatchListPage /></MemoryRouter>)
  expect(await screen.findByText('Kèo đã được tạo và đang tìm đối thủ.')).toBeInTheDocument()
  expect(await screen.findByTestId('match-card-m1')).toHaveClass('ring-2')
  await vi.advanceTimersByTimeAsync(4_000)
  await waitFor(() => expect(screen.getByTestId('match-card-m1')).not.toHaveClass('ring-2'))
})

it('links to a created match hidden by current filters', async () => {
  vi.mocked(listMatches).mockResolvedValue({ matches: [] })
  render(<MemoryRouter initialEntries={['/matches?created=m1']}><MatchListPage /></MemoryRouter>)
  expect(await screen.findByRole('link', { name: 'Xem kèo vừa tạo' })).toHaveAttribute('href', '/matches/m1')
})
