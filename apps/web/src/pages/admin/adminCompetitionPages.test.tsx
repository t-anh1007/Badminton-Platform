import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { AdminSeasonsPage } from './AdminSeasonsPage.js'
import { AdminRewardProgramsPage } from './AdminRewardProgramsPage.js'
import { AdminRewardPayoutsPage } from './AdminRewardPayoutsPage.js'
import { createSeason, listAdminSeasons } from '../../lib/competitionApi'
import {
  approveRewardProgramFinal, cancelRewardProgram, createRewardProgram, getAdminRewardPayout, getAdminRewardProgram, listAdminRewardPrograms,
  markRewardPayoutPaid, publishRewardProgram,
} from '../../lib/rewardApi'

vi.mock('../../lib/competitionApi', () => ({ listAdminSeasons: vi.fn(), createSeason: vi.fn(), closeSeason: vi.fn() }))
vi.mock('../../lib/rewardApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/rewardApi')>()),
  listAdminRewardPrograms: vi.fn(), getAdminRewardProgram: vi.fn(), createRewardProgram: vi.fn(), publishRewardProgram: vi.fn(),
  cancelRewardProgram: vi.fn(), approveRewardProgramFinal: vi.fn(), listAdminRewardPayouts: vi.fn(), getAdminRewardPayout: vi.fn(),
  authorizePayoutProof: vi.fn(), markRewardPayoutPaid: vi.fn(),
}))
vi.mock('../../lib/communityApi', () => ({ uploadAuthorizedFile: vi.fn().mockResolvedValue(undefined) }))

const FIVE_MB = 5 * 1024 * 1024
beforeAll(() => { URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn() })
afterEach(() => { cleanup(); vi.clearAllMocks() })

const season = { id: 's1', name: 'Tháng 9-10/2026', startAt: '2026-08-31T17:00:00Z', endAt: '2026-10-31T17:00:00Z', status: 'active' as const, eligiblePlayerCount: 1284 }

it('lists seasons with one-line names and shows the overlap error from create', async () => {
  vi.mocked(listAdminSeasons).mockResolvedValue({ items: [season, { ...season, id: 's0', name: 'Tháng 7-8/2026', status: 'closed' }], total: 2, page: 1, pageSize: 10 })
  vi.mocked(createSeason).mockRejectedValue(new Error('Kỳ thi đấu bị chồng thời gian với một kỳ khác.'))
  render(<MemoryRouter><AdminSeasonsPage /></MemoryRouter>)
  const row = (await screen.findAllByText('Tháng 9-10/2026')).find((node) => node.closest('tr'))!.closest('tr')!
  expect(within(row).getByText('01/09/2026 - 31/10/2026')).toBeInTheDocument()
  expect(within(row).getByRole('button', { name: 'Xem' })).toBeInTheDocument()
  expect(screen.getByText('1.284')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Tên kỳ hiển thị'), { target: { value: 'Tháng 10-11/2026' } })
  fireEvent.change(screen.getByLabelText('Ngày bắt đầu'), { target: { value: '2026-10-15' } })
  fireEvent.change(screen.getByLabelText('Ngày kết thúc'), { target: { value: '2026-11-30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tạo kỳ' }))
  await waitFor(() => expect(createSeason).toHaveBeenCalledWith({ name: 'Tháng 10-11/2026', startAt: '2026-10-14T17:00:00.000Z', endAt: '2026-11-30T17:00:00.000Z' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('chồng thời gian')
})

const program = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1', name: 'Top đánh đơn TP. Hồ Chí Minh', seasonId: 's1', status: 'active', criterion: 'ending_rating', criterionLabel: 'Điểm xếp hạng cao nhất',
  discipline: 'singles', band: 'under_1600', scope: 'province', provinceCode: 'ho-chi-minh', serverNow: '', startAt: '2026-09-30T17:00:00Z',
  endAt: '2026-10-31T17:00:00Z', reconciling: false, tiers: [{ rank: 1, amount: '2000000' }], fundingSource: 'marketing', locked: true, ...overrides,
})

it('builds configurable prize tiers with a display-only total and publishes after confirmation', async () => {
  vi.mocked(listAdminSeasons).mockResolvedValue({ items: [season], total: 1, page: 1, pageSize: 50 })
  vi.mocked(listAdminRewardPrograms).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 })
  vi.mocked(createRewardProgram).mockResolvedValue({ program: program({ status: 'draft' }) } as never)
  vi.mocked(publishRewardProgram).mockResolvedValue({ program: program() } as never)
  render(<MemoryRouter><AdminRewardProgramsPage /></MemoryRouter>)
  await screen.findByRole('option', { name: 'Tháng 9-10/2026' })
  fireEvent.change(screen.getByLabelText('Tên chương trình'), { target: { value: 'Top đánh đơn TP. Hồ Chí Minh' } })
  fireEvent.change(screen.getByLabelText('Kỳ xếp hạng'), { target: { value: 's1' } })
  fireEvent.change(screen.getByLabelText('Ngày bắt đầu'), { target: { value: '2026-10-01' } })
  fireEvent.change(screen.getByLabelText('Ngày kết thúc'), { target: { value: '2026-10-31' } })
  fireEvent.click(screen.getByRole('radio', { name: /Nhiều trận thắng nhất/ }))
  fireEvent.change(screen.getByLabelText('Phạm vi'), { target: { value: 'province' } })
  fireEvent.change(screen.getByLabelText('Tỉnh/thành'), { target: { value: 'ho-chi-minh' } })
  fireEvent.change(screen.getByLabelText('Top 1'), { target: { value: '2.000.000' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Thêm mức giải' }))
  fireEvent.change(screen.getByLabelText('Top 2'), { target: { value: '1000000' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Thêm mức giải' }))
  fireEvent.change(screen.getByLabelText('Top 3'), { target: { value: '500000' } })
  expect(screen.getByText('Tổng tiền thưởng').nextElementSibling).toHaveTextContent('3.500.000')
  fireEvent.click(screen.getByRole('button', { name: 'Xóa mức giải Top 3' }))
  expect(screen.getByText('Tổng tiền thưởng').nextElementSibling).toHaveTextContent('3.000.000')
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra và công bố' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Công bố' }))
  await waitFor(() => expect(createRewardProgram).toHaveBeenCalledWith({
    name: 'Top đánh đơn TP. Hồ Chí Minh', seasonId: 's1', criterion: 'most_wins', discipline: 'singles', band: 'under_1600', scope: 'province',
    provinceCode: 'ho-chi-minh', startAt: '2026-09-30T17:00:00.000Z', endAt: '2026-10-31T17:00:00.000Z', fundingSource: 'marketing',
    tiers: [{ rank: 1, amount: '2000000' }, { rank: 2, amount: '1000000' }],
  }))
  await waitFor(() => expect(publishRewardProgram).toHaveBeenCalledWith('p1'))
})

it('locks published programs, requires a reason to cancel a running one and reviews tie awards before approval', async () => {
  vi.mocked(listAdminSeasons).mockResolvedValue({ items: [season], total: 1, page: 1, pageSize: 50 })
  vi.mocked(listAdminRewardPrograms).mockResolvedValue({ items: [program(), program({ id: 'p2', name: 'Chuỗi thắng', status: 'awaiting_admin_approval' }), program({ id: 'p3', name: 'Đã xong', status: 'final' })], total: 3, page: 1, pageSize: 10 } as never)
  vi.mocked(cancelRewardProgram).mockResolvedValue({ program: program({ status: 'cancelled' }) } as never)
  vi.mocked(getAdminRewardProgram).mockResolvedValue({ program: program({ id: 'p2', name: 'Chuỗi thắng', status: 'awaiting_admin_approval', awardTotal: '3000000', awards: [
    { userId: 'a', displayName: 'Quốc Huy', avatarUrl: null, rank: 1, score: 9, amount: '1500000' },
    { userId: 'b', displayName: 'Hoàng Nam', avatarUrl: null, rank: 1, score: 9, amount: '1500000' },
  ] }) } as never)
  vi.mocked(approveRewardProgramFinal).mockResolvedValue({ program: program({ status: 'final' }) } as never)
  render(<MemoryRouter><AdminRewardProgramsPage /></MemoryRouter>)
  await screen.findByText('Chuỗi thắng')
  expect(screen.queryByRole('button', { name: /Sửa/ })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Danh sách nhận giải' })).toHaveAttribute('href', '/admin/reward-payouts?programId=p3')
  fireEvent.click(screen.getByRole('button', { name: 'Hủy chương trình' }))
  const dialog = screen.getByRole('dialog', { name: 'Hủy chương trình thưởng' })
  const confirmCancel = within(dialog).getByRole('button', { name: 'Xác nhận hủy' })
  expect(confirmCancel).toBeDisabled()
  fireEvent.change(within(dialog).getByLabelText(/Lý do hủy/), { target: { value: 'Nhà tài trợ rút' } })
  fireEvent.click(confirmCancel)
  await waitFor(() => expect(cancelRewardProgram).toHaveBeenCalledWith('p1', 'Nhà tài trợ rút'))
  fireEvent.click(await screen.findByRole('button', { name: 'Duyệt kết quả' }))
  const review = await screen.findByRole('dialog', { name: 'Duyệt danh sách nhận giải' })
  expect(within(review).getAllByRole('row').filter((row) => row.textContent?.includes('1.500.000'))).toHaveLength(2)
  fireEvent.click(within(review).getByRole('button', { name: 'Duyệt và thông báo người nhận' }))
  await waitFor(() => expect(approveRewardProgramFinal).toHaveBeenCalledWith('p2'))
})

const payout = {
  id: 'pay1', serverNow: new Date().toISOString(), programId: 'p1', programName: 'Top đánh đơn', achievementLabel: 'Hạng 1', amount: '2000000',
  status: 'ready_to_pay', claimDeadlineAt: '', payoutDeadlineAt: new Date(Date.now() + 6 * 86_400_000).toISOString(), informationComplete: true,
  paidAt: null, transactionReference: null, userId: 'u1', overdue: false, proof: null, paidByUserId: null, cancelledAt: null, proofUrl: null,
  receiver: { recipientName: 'Nguyễn Minh Anh', email: 'a@b.c', phone: '0901234567', address: '123 Q7', bankCode: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'NGUYEN MINH ANH' },
}

it('shows the bank deadline, rejects proof over 5 MB and marks paid only after a second confirmation', async () => {
  vi.mocked(getAdminRewardPayout).mockResolvedValue({ payout } as never)
  const { authorizePayoutProof } = await import('../../lib/rewardApi')
  vi.mocked(authorizePayoutProof).mockResolvedValue({ objectKey: 'finance/rewards/proof.png', uploadUrl: 'https://u', headers: {}, expiresAt: '' })
  vi.mocked(markRewardPayoutPaid).mockResolvedValue({ payout: { ...payout, status: 'paid' } } as never)
  render(<MemoryRouter initialEntries={['/admin/reward-payouts/pay1']}><Routes><Route path="/admin/reward-payouts/:payoutId" element={<AdminRewardPayoutsPage />} /></Routes></MemoryRouter>)
  expect(await screen.findByText('Thời gian còn lại để chuyển thưởng')).toBeInTheDocument()
  expect(screen.getByText('0123456789')).toBeInTheDocument()
  const input = screen.getByLabelText('Tải ảnh chứng từ')
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(FIVE_MB + 1)], 'big.png', { type: 'image/png' })] } })
  expect(await screen.findByText('Ảnh vượt quá 5 MB.')).toBeInTheDocument()
  expect(authorizePayoutProof).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Gỡ' }))
  fireEvent.change(screen.getByLabelText('Tải ảnh chứng từ'), { target: { files: [new File(['abc'], 'proof.png', { type: 'image/png' })] } })
  await screen.findByText('Đã tải')
  fireEvent.change(screen.getByLabelText('Mã giao dịch ngân hàng'), { target: { value: 'VCB261107A012345' } })
  const mark = screen.getByRole('button', { name: 'Đánh dấu đã trả thưởng' })
  expect(mark).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(mark)
  expect(markRewardPayoutPaid).not.toHaveBeenCalled()
  const dialog = screen.getByRole('dialog', { name: 'Xác nhận đã trả thưởng' })
  expect(dialog).toHaveTextContent('Nguyễn Minh Anh')
  expect(dialog).toHaveTextContent('2.000.000')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận đã trả' }))
  await waitFor(() => expect(markRewardPayoutPaid).toHaveBeenCalledWith('pay1', { transactionReference: 'VCB261107A012345', proofObjectKey: 'finance/rewards/proof.png' }))
})
