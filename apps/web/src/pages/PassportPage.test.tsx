import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PassportPage } from './PassportPage.js'
import { declarePassportTier, getMatchHistory, getOwnPassport } from '../lib/passportApi'
import { getCurrentSeason, getLeaderboard, selectSeasonRegion } from '../lib/competitionApi'

vi.mock('../lib/passportApi', () => ({
  getOwnPassport: vi.fn(), getPublicPassport: vi.fn(), declarePassportTier: vi.fn(), getMatchHistory: vi.fn(), submitMatchEvaluation: vi.fn(),
}))
vi.mock('../lib/competitionApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/competitionApi')>()),
  getCurrentSeason: vi.fn(), getLeaderboard: vi.fn(), selectSeasonRegion: vi.fn(),
}))
vi.mock('../lib/accountApi', () => ({ getMyProfile: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c', phone: null, roles: ['player'], playerProfile: { displayName: 'Minh Anh', avatarUrl: null, visibility: 'public' } }) }))

const singles = {
  declaredTier: 'intermediate', declaredAt: '2026-09-01T00:00:00Z', tier: 'intermediate', rating: 1548, matchesPlayed: 30,
  ratingStability: 'established', leaderboardVisible: true, leaderboardBand: 'under_1600', season: { matchesPlayed: 12, wins: 8, currentWinStreak: 3 }, updatedAt: '2026-09-25T00:00:00Z',
}
const passport = {
  userId: 'u1', singles, doubles: null, canDeclare: { singles: false, doubles: true },
  evaluationScore: null, evaluationCount: 0, flaggedEvaluationCount: 0, recentMatches: [],
  badges: [{ label: 'Chuỗi 5 trận thắng', disciplineLabel: 'Đơn', seasonName: 'Kỳ 9-10/2026', provinceName: null, awardedAt: '2026-09-20T00:00:00Z' }],
}
const renderPage = () => render(<MemoryRouter initialEntries={['/passport']}><Routes><Route path="/passport" element={<PassportPage />} /></Routes></MemoryRouter>)

beforeEach(() => {
  localStorage.setItem('accessToken', 'x')
  vi.mocked(getOwnPassport).mockResolvedValue(passport as never)
  vi.mocked(getCurrentSeason).mockResolvedValue({ season: { id: 's1', name: 'Kỳ 9-10/2026', startAt: '2026-09-01T00:00:00Z', endAt: '2026-10-31T00:00:00Z', status: 'active' }, myRegion: 'ho-chi-minh' })
  vi.mocked(getLeaderboard).mockResolvedValue({ items: [], viewer: { rank: 24, userId: 'u1', displayName: 'Minh Anh', avatarUrl: null, provinceCode: 'ho-chi-minh', rating: 1548, matchesPlayed: 12, wins: 8 }, total: 40, page: 1, pageSize: 1, serverNow: '' })
  vi.mocked(getMatchHistory).mockResolvedValue({ items: [{ matchId: 'm9', businessCode: 'KEO-9', endedAt: '2026-09-24T12:00:00Z', discipline: 'singles', mode: 'ranked', outcome: 'win', scoreLabel: '21-15, 21-18', ratingDelta: 18, opponents: [{ userId: 'u2', displayName: 'Phúc Nguyễn', avatarUrl: null }] }], total: 12, page: 1, pageSize: 5 })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shows the singles rating with a stability label, season stats, rank and badges without raw uncertainty numbers', async () => {
  renderPage()
  expect(await screen.findByText('1.548')).toBeInTheDocument()
  expect(screen.getByText('Ổn định')).toBeInTheDocument()
  expect(screen.getByText('Trận hợp lệ kỳ này').parentElement).toHaveTextContent('12')
  expect(screen.getByText('Đủ điều kiện lên bảng')).toBeInTheDocument()
  expect(await screen.findByText('Minh Anh')).toBeInTheDocument()
  expect((await screen.findByText('Khu vực xếp hạng kỳ này')).nextElementSibling).toHaveTextContent('Thành phố Hồ Chí Minh')
  expect(await screen.findAllByText('#24')).toHaveLength(2)
  expect(getLeaderboard).toHaveBeenCalledWith(expect.objectContaining({ discipline: 'singles', scope: 'province', provinceCode: 'ho-chi-minh', band: 'under_1600' }))
  expect(screen.getByText('Chuỗi 5 trận thắng')).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/RD|sigma|±/)
})

it('pages through match history of the selected discipline', async () => {
  renderPage()
  fireEvent.click(await screen.findByRole('tab', { name: 'Lịch sử đấu' }))
  expect(await screen.findByText('Thắng Phúc Nguyễn · 21-15, 21-18')).toBeInTheDocument()
  expect(screen.getByText('+18 điểm')).toBeInTheDocument()
  expect(getMatchHistory).toHaveBeenLastCalledWith('singles', 1, 5)
  fireEvent.click(screen.getByRole('button', { name: '›' }))
  await waitFor(() => expect(getMatchHistory).toHaveBeenLastCalledWith('singles', 2, 5))
})

it('uses the backend band for a 1599.6 rating shown as 1.600 and labels unrated ranked matches', async () => {
  vi.mocked(getOwnPassport).mockResolvedValue({ ...passport, singles: { ...singles, rating: 1600, leaderboardBand: 'under_1600' } } as never)
  vi.mocked(getMatchHistory).mockResolvedValue({ items: [
    { matchId: 'm1', businessCode: 'K1', endedAt: '2026-09-24T12:00:00Z', discipline: 'singles', mode: 'ranked', outcome: 'win', scoreLabel: '21-15, 21-18', ratingDelta: null, opponents: [] },
    { matchId: 'm2', businessCode: 'K2', endedAt: '2026-09-23T12:00:00Z', discipline: 'singles', mode: 'friendly', outcome: 'loss', scoreLabel: '15-21, 18-21', ratingDelta: null, opponents: [] },
  ], total: 2, page: 1, pageSize: 5 })
  renderPage()
  expect(await screen.findByText('1.600')).toBeInTheDocument()
  await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith(expect.objectContaining({ band: 'under_1600' })))
  expect(getLeaderboard).not.toHaveBeenCalledWith(expect.objectContaining({ band: 'from_1600' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Lịch sử đấu' }))
  expect(await screen.findByText(/Kèo xếp hạng - không tính điểm/)).toBeInTheDocument()
  expect(screen.getByText(/Kèo giao hữu/)).toBeInTheDocument()
})

it('declares the undeclared doubles tier once', async () => {
  vi.mocked(declarePassportTier).mockResolvedValue({ ...passport, doubles: { ...singles, rating: 1500 }, canDeclare: { singles: false, doubles: false } } as never)
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Đánh đôi' }))
  const save = screen.getByRole('button', { name: 'Lưu khai báo' })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Bậc hiện tại của bạn'), { target: { value: 'intermediate_plus' } })
  fireEvent.click(save)
  await waitFor(() => expect(declarePassportTier).toHaveBeenCalledWith('doubles', 'intermediate_plus'))
  expect(await screen.findByText('1.500')).toBeInTheDocument()
})

it('asks for confirmation before locking the season region', async () => {
  vi.mocked(getCurrentSeason).mockResolvedValue({ season: { id: 's1', name: 'Kỳ 9-10/2026', startAt: '2026-09-01T00:00:00Z', endAt: '2026-10-31T00:00:00Z', status: 'active' }, myRegion: null })
  vi.mocked(selectSeasonRegion).mockResolvedValue({ seasonId: 's1', provinceCode: 'ha-noi', lockedAt: '' })
  renderPage()
  fireEvent.change(await screen.findByLabelText(/Chọn tỉnh\/thành chính/), { target: { value: 'ha-noi' } })
  fireEvent.click(screen.getByRole('button', { name: 'Chọn khu vực' }))
  const dialog = screen.getByRole('dialog', { name: 'Xác nhận khu vực xếp hạng' })
  expect(dialog).toHaveTextContent('khóa đến hết kỳ')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận khu vực' }))
  await waitFor(() => expect(selectSeasonRegion).toHaveBeenCalledWith('ha-noi'))
  expect(await screen.findByText('Khu vực xếp hạng kỳ này')).toBeInTheDocument()
})
