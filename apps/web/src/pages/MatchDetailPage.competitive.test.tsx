import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MatchDetailPage } from './MatchDetailPage.js'
import { getMatchDetail, getMyScheduleConflicts, requestMatchJoin } from '../lib/matchApi.js'

vi.mock('../components/map/LocationMap', () => ({ LocationMap: () => null }))
vi.mock('../lib/matchApi.js', () => ({
  getMatchDetail: vi.fn(), getMyScheduleConflicts: vi.fn(), requestMatchJoin: vi.fn(),
  cancelMatch: vi.fn(), withdrawMatchJoin: vi.fn(), abandonMatch: vi.fn(), abandonMatchJoin: vi.fn(),
}))

const detail = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1', businessCode: 'KEO-00000118', status: 'open', paymentPending: false, capacity: 2, openSlots: 1, feePerSlot: '140000',
  skillMin: 'intermediate_plus', skillMax: 'advanced', skillConfiguredAt: '2026-09-25T00:00:00Z',
  cutoffAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
  startAt: '2026-09-26T11:00:00Z', endAt: '2026-09-26T12:00:00Z',
  court: { id: 'c1', name: 'Sân số 03' }, venue: { id: 'v1', name: 'Nhà thi đấu Quận 7', address: '123 Nguyễn Thị Thập', lat: 10.7, lng: 106.7 },
  organizer: { displayName: 'Minh Anh', avatarUrl: null, identityVisibility: 'public', tier: 'intermediate_plus' },
  confirmedParticipants: 0,
  sourceType: 'paid_booking', mode: 'ranked', discipline: 'singles', ratio: '7:3', format: 'bo3', bookingPrice: '200000',
  teamSlots: [{ side: 'A', size: 1, open: 0 }, { side: 'B', size: 1, open: 1 }],
  participants: [{ userId: 'u1', displayName: 'Minh Anh', avatarUrl: null, teamSide: 'A', role: 'organizer', paymentState: 'paid' }],
  funding: {
    bookingPrice: '200000', totalContribution: '280000', resultHeldAmount: '80000', regularSlotAmount: '140000',
    organizerContribution: null, viewerAdditionalAmountDue: '140000', organizerRefundAtLock: null, organizerRefundWithdrawable: null,
  },
  actions: { canJoin: true, isOrganizer: false, canPayOrganizerContribution: false, ownJoin: null, canJoinTeamA: false, canJoinTeamB: true, canPay: false, canWithdrawBeforeLock: false, canReportIncident: false },
  ...overrides,
})

const renderPage = () => render(<MemoryRouter initialEntries={['/matches/m1']}><Routes><Route path="/matches/:id" element={<MatchDetailPage />} /></Routes></MemoryRouter>)

beforeEach(() => {
  localStorage.setItem('accessToken', 'token')
  vi.mocked(getMyScheduleConflicts).mockResolvedValue({ conflicts: [] })
  vi.mocked(requestMatchJoin).mockResolvedValue({ id: 'j1', status: 'approved', approvedAt: null, matchId: 'm1' })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shows the locked configuration, authoritative booking and backend money without raw terms', async () => {
  vi.mocked(getMatchDetail).mockResolvedValue(detail() as never)
  renderPage()
  expect(await screen.findByText('Thông tin đã khóa')).toBeInTheDocument()
  expect(screen.getByText('Kèo xếp hạng - Đánh đơn')).toBeInTheDocument()
  expect(screen.getByText('7 : 3')).toBeInTheDocument()
  expect(screen.getByText('BO3 - 21 điểm - giới hạn 30')).toBeInTheDocument()
  expect(screen.getByText('123 Nguyễn Thị Thập')).toBeInTheDocument()
  expect(screen.getByText(/Hạn chốt kèo -/)).toBeInTheDocument()
  const money = screen.getByRole('heading', { name: 'Tình trạng tiền kèo' }).closest('section')!
  expect(within(money).getByText('Bạn cần trả thêm').parentElement!.parentElement).toHaveTextContent('140.000đ')
  expect(within(money).getByText('Giữ chờ kết quả').parentElement!.parentElement).toHaveTextContent('80.000đ')
  expect(document.body.textContent).not.toMatch(/cutoff|reserve|contribution|paid_booking|ranked|singles/)
})

it('joins the team the player chooses from the open slot', async () => {
  vi.mocked(getMatchDetail).mockResolvedValue(detail() as never)
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Vào đội B' }))
  await waitFor(() => expect(requestMatchJoin).toHaveBeenCalledWith('m1', 'B'))
  expect(screen.queryByRole('button', { name: 'Vào đội A' })).not.toBeInTheDocument()
})

const openA = { teamSlots: [{ side: 'A', size: 2, open: 1 }, { side: 'B', size: 2, open: 1 }], capacity: 4, discipline: 'doubles',
  actions: { canJoin: true, isOrganizer: false, canPayOrganizerContribution: false, ownJoin: null, canJoinTeamA: true, canJoinTeamB: true, canPay: false, canWithdrawBeforeLock: false, canReportIncident: false } }

it('sends team A when the player picks A and there is no schedule conflict', async () => {
  vi.mocked(getMatchDetail).mockResolvedValue(detail(openA) as never)
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Vào đội A' }))
  await waitFor(() => expect(requestMatchJoin).toHaveBeenCalledWith('m1', 'A'))
})

it('keeps team A after the player continues past a schedule conflict', async () => {
  vi.mocked(getMatchDetail).mockResolvedValue(detail(openA) as never)
  vi.mocked(getMyScheduleConflicts).mockResolvedValue({ conflicts: [{ kind: 'booking', startAt: '2026-09-26T11:00:00Z', endAt: '2026-09-26T12:00:00Z', venue: { name: 'Sân khác' }, court: { name: 'Sân 1' } }] } as never)
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Vào đội A' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Vẫn tiếp tục' }))
  await waitFor(() => expect(requestMatchJoin).toHaveBeenCalledWith('m1', 'A'))
})

it('shows the paid-booking organizer refund as withdrawable and the organizer remainder share', async () => {
  vi.mocked(getMatchDetail).mockResolvedValue(detail({
    funding: {
      bookingPrice: '200000', totalContribution: '280000', resultHeldAmount: '80000', regularSlotAmount: '140000',
      organizerContribution: '140000', viewerAdditionalAmountDue: '0', organizerRefundAtLock: '60000', organizerRefundWithdrawable: true,
    },
    actions: { canJoin: false, isOrganizer: true, canPayOrganizerContribution: false, ownJoin: null, canJoinTeamA: false, canJoinTeamB: false },
  }) as never)
  renderPage()
  const refund = (await screen.findByText('Hoàn cho chủ kèo')).parentElement!.parentElement!
  expect(refund).toHaveTextContent('60.000đ')
  expect(refund).toHaveTextContent('Có thể rút')
  expect(screen.getByText('Chủ kèo')).toBeInTheDocument()
})
