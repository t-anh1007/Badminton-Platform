import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LeaderboardPage } from './LeaderboardPage.js'
import { getCurrentSeason, getLeaderboard } from '../lib/competitionApi'
import { getOwnPassport } from '../lib/passportApi'
import { listRewardPrograms } from '../lib/rewardApi'

vi.mock('../lib/competitionApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/competitionApi')>()),
  getCurrentSeason: vi.fn(), getLeaderboard: vi.fn(),
}))
vi.mock('../lib/passportApi', () => ({ getOwnPassport: vi.fn() }))
vi.mock('../lib/rewardApi', () => ({ listRewardPrograms: vi.fn() }))

const row = (rank: number, userId: string, displayName: string, rating: number) =>
  ({ rank, userId, displayName, avatarUrl: null, provinceCode: 'ho-chi-minh', rating, matchesPlayed: 12, wins: 8 })
const renderPage = (url = '/leaderboard') => render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/leaderboard" element={<LeaderboardPage />} /></Routes></MemoryRouter>)

beforeEach(() => {
  localStorage.setItem('accessToken', 'x')
  vi.mocked(getCurrentSeason).mockResolvedValue({ season: { id: 's1', name: 'Kỳ 9-10/2026', startAt: '2026-09-01T00:00:00Z', endAt: '2026-10-31T00:00:00Z', status: 'active' }, myRegion: 'ho-chi-minh' })
  vi.mocked(getOwnPassport).mockResolvedValue({ singles: { rating: 1548, leaderboardBand: 'under_1600' }, doubles: null } as never)
  vi.mocked(getLeaderboard).mockResolvedValue({
    items: [row(1, 'u9', 'Quốc Huy', 1598), row(24, 'u1', 'Minh Anh', 1548)],
    viewer: row(24, 'u1', 'Minh Anh', 1548), total: 45, page: 1, pageSize: 20, serverNow: '',
  })
  vi.mocked(listRewardPrograms).mockResolvedValue({ items: [{ id: 'p1', name: 'Top đánh đơn TP. Hồ Chí Minh', status: 'active', discipline: 'singles', band: 'under_1600', scope: 'province', provinceCode: 'ho-chi-minh' }] } as never)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('opens the viewer board by region and band, pins the viewer and has no movement column', async () => {
  renderPage()
  expect(await screen.findByText('Quốc Huy')).toBeInTheDocument()
  expect(getLeaderboard).toHaveBeenLastCalledWith({ discipline: 'singles', scope: 'province', provinceCode: 'ho-chi-minh', band: 'under_1600', page: 1, pageSize: 20 })
  const mine = screen.getAllByRole('row').find((item) => item.getAttribute('aria-current'))!
  expect(within(mine).getByText('Bạn')).toBeInTheDocument()
  expect(screen.getByText('#24')).toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: 'Thay đổi' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Xem cơ cấu giải thưởng' })).toHaveAttribute('href', '/rewards/p1')
})

it('switches scope, band and page through the filters', async () => {
  renderPage()
  await screen.findByText('Quốc Huy')
  fireEvent.click(screen.getByRole('button', { name: 'Toàn nền tảng' }))
  await waitFor(() => expect(getLeaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'global', page: 1 })))
  fireEvent.click(screen.getByRole('button', { name: 'Từ 1.600' }))
  await waitFor(() => expect(getLeaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ band: 'from_1600' })))
  fireEvent.click(await screen.findByRole('button', { name: '›' }))
  await waitFor(() => expect(getLeaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ band: 'from_1600', page: 2 })))
})

it('opens the board the backend assigns to the viewer', async () => {
  vi.mocked(getOwnPassport).mockResolvedValue({ singles: { rating: 1600, leaderboardBand: 'from_1600' }, doubles: null } as never)
  renderPage()
  await waitFor(() => expect(getLeaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ band: 'from_1600' })))
  expect(getLeaderboard).not.toHaveBeenCalledWith(expect.objectContaining({ band: 'under_1600' }))
})
