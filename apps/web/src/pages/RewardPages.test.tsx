import type { ReactElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RewardPayoutsPage, RewardProgramDetailPage, RewardProgramsPage } from './RewardPages.js'
import { getMyRewardPayout, getRewardProgram, listRewardPrograms, submitPayoutInformation } from '../lib/rewardApi'

vi.mock('../lib/rewardApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/rewardApi')>()),
  listRewardPrograms: vi.fn(), getRewardProgram: vi.fn(), listMyRewardPayouts: vi.fn(), getMyRewardPayout: vi.fn(), submitPayoutInformation: vi.fn(),
}))
vi.mock('../lib/accountApi', () => ({ getMyProfile: vi.fn().mockResolvedValue({ id: 'u1', email: 'minhanh@example.com', phone: '0901234567', roles: ['player'], playerProfile: { displayName: 'Nguyễn Minh Anh', avatarUrl: null, visibility: 'public' } }) }))

const now = new Date().toISOString()
const program = {
  id: 'p1', name: 'Top đánh đơn TP. Hồ Chí Minh', seasonId: 's1', status: 'active', criterion: 'ending_rating', criterionLabel: 'Điểm xếp hạng cuối kỳ',
  discipline: 'singles', band: 'under_1600', scope: 'province', provinceCode: 'ho-chi-minh', serverNow: now,
  startAt: '2026-10-01T00:00:00Z', endAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), reconciling: false,
  tiers: [{ rank: 1, amount: '2000000' }, { rank: 2, amount: '1000000' }, { rank: 3, amount: '500000' }], viewer: { rank: 24, score: 1548 },
}
const payout = {
  id: 'pay1', serverNow: now, programId: 'p1', programName: 'Top đánh đơn TP. Hồ Chí Minh', achievementLabel: 'Hạng nhất', amount: '2000000',
  status: 'awaiting_information', claimDeadlineAt: new Date(Date.now() + 6 * 86_400_000).toISOString(), payoutDeadlineAt: null,
  informationComplete: false, paidAt: null, transactionReference: null, proofUrl: null,
}
const at = (url: string, path: string, element: ReactElement) => render(<MemoryRouter initialEntries={[url]}><Routes><Route path={path} element={element} /></Routes></MemoryRouter>)

beforeEach(() => { localStorage.setItem('accessToken', 'x') })
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('lists published programs with status and first prize', async () => {
  vi.mocked(listRewardPrograms).mockResolvedValue({ items: [program] } as never)
  at('/rewards', '/rewards', <RewardProgramsPage />)
  expect(await screen.findByText('Top đánh đơn TP. Hồ Chí Minh')).toBeInTheDocument()
  expect(screen.getByText('Đang diễn ra')).toBeInTheDocument()
  expect(screen.getByText(/Giải nhất 2\.000\.000/)).toBeInTheDocument()
})

it('shows countdown, prize tiers, rules and the viewer provisional rank', async () => {
  vi.mocked(getRewardProgram).mockResolvedValue({ program } as never)
  at('/rewards/p1', '/rewards/:programId', <RewardProgramDetailPage />)
  expect(await screen.findByRole('heading', { name: 'Top đánh đơn TP. Hồ Chí Minh' })).toBeInTheDocument()
  expect(screen.getByText(/^1 ngày \d\d:\d\d:\d\d$|^2 ngày 00:00:00$/)).toBeInTheDocument()
  expect(screen.getByText('Hạng nhất').closest('li')).toHaveTextContent('2.000.000')
  expect(screen.getByText('Đồng hạng được chia đều')).toBeInTheDocument()
  expect(screen.getByText('Hạng tạm tính')).toBeInTheDocument()
  expect(screen.getByText('#24')).toBeInTheDocument()
  expect(screen.getByText('1.548 điểm xếp hạng')).toBeInTheDocument()
})

it('submits exactly the seven payout fields after inline validation', async () => {
  vi.mocked(getMyRewardPayout).mockResolvedValue({ payout } as never)
  vi.mocked(submitPayoutInformation).mockResolvedValue({ payout: { ...payout, status: 'ready_to_pay', informationComplete: true, payoutDeadlineAt: new Date(Date.now() + 7 * 86_400_000).toISOString() } } as never)
  at('/rewards/payouts/pay1', '/rewards/payouts/:payoutId', <RewardPayoutsPage />)
  await waitFor(() => expect(screen.getByLabelText('Email')).toHaveValue('minhanh@example.com'))
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin nhận thưởng' }))
  expect(await screen.findByText('Nhập địa chỉ liên hệ.')).toBeInTheDocument()
  expect(screen.getByLabelText('Số tài khoản')).toHaveAttribute('aria-invalid', 'true')
  expect(submitPayoutInformation).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Địa chỉ liên hệ'), { target: { value: '123 Nguyễn Thị Thập, TP. Hồ Chí Minh' } })
  fireEvent.change(screen.getByLabelText('Ngân hàng'), { target: { value: 'VCB' } })
  fireEvent.change(screen.getByLabelText('Số tài khoản'), { target: { value: '0123 456 789' } })
  fireEvent.change(screen.getByLabelText('Tên chủ tài khoản'), { target: { value: 'NGUYEN MINH ANH' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin nhận thưởng' }))
  await waitFor(() => expect(submitPayoutInformation).toHaveBeenCalledWith('pay1', {
    recipientName: 'Nguyễn Minh Anh', email: 'minhanh@example.com', phone: '0901234567', address: '123 Nguyễn Thị Thập, TP. Hồ Chí Minh',
    bankCode: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'NGUYEN MINH ANH',
  }))
  expect(await screen.findByText('Chờ chuyển thưởng')).toBeInTheDocument()
})

it('links a winner of a final program to their payout', async () => {
  vi.mocked(getRewardProgram).mockResolvedValue({ program: { ...program, status: 'final', viewer: { rank: 1, score: 1600 } } } as never)
  at('/rewards/p1', '/rewards/:programId', <RewardProgramDetailPage />)
  expect(await screen.findByRole('link', { name: 'Xem khoản thưởng và bổ sung thông tin nhận thưởng' })).toHaveAttribute('href', '/rewards/payouts')
})
