import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminMatchResultsPage } from './AdminMatchResultsPage.js'
import { getAdminResultCase, listAdminResultCases, previewAdminDecision, readResultEvidence, type ReviewCaseDetail, type ReviewQueueItem } from '../../lib/matchApi.js'
import { decideAdminResultV2 } from '../../lib/resultApi'

vi.mock('../../lib/matchApi.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/matchApi.js')>()),
  listAdminResultCases: vi.fn(), getAdminResultCase: vi.fn(), previewAdminDecision: vi.fn(), decideAdminResult: vi.fn(), readResultEvidence: vi.fn(),
}))
vi.mock('../../lib/resultApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/resultApi')>()),
  decideAdminResultV2: vi.fn(),
}))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const person = (userId: string, displayName: string) => ({ userId, displayName, avatarUrl: null })
const item = (patch: Partial<ReviewQueueItem> = {}): ReviewQueueItem => ({
  caseId: 'c1', matchId: 'm1', matchCode: 'KEO-00004127', bookingCode: null, venueName: 'Sân Linh Xuân', courtName: 'Sân 3', status: 'admin_review', version: 5,
  discipline: 'doubles', mode: 'ranked', startAt: '2026-10-22T11:00:00Z', endAt: '2026-10-22T13:00:00Z', providerDeadlineAt: null,
  adminReviewStartedAt: '2026-10-23T00:10:00Z', adminOverdue: false, adminReason: 'appeal', level: 'yellow', ...patch,
})
const photoDetail = {
  ...item(), serverNow: '2026-10-23T02:00:00Z', declarationDeadlineAt: '2026-10-23T01:00:00Z', objectionDeadlineAt: null, incidentDeadlineAt: null, booking: null,
  match: { discipline: 'doubles', mode: 'ranked', format: 'bo3', ratio: '7:3', teams: [
    { side: 'A', players: [person('a1', 'Tuấn Anh'), person('a2', 'Minh Khôi')] }, { side: 'B', players: [person('b1', 'Lan Phương'), person('b2', 'Đức Phúc')] },
  ] },
  claims: [], responses: [], supplementalEvidence: [], providerRecommendation: null, actions: { canPreviewDecision: true },
  rulesVersion: 'ra_v1', adminReason: 'appeal', reputations: { a1: 'good', a2: 'good', b1: 'watch', b2: 'good' },
  claimViews: [{
    id: 'c1', claimantUserId: 'a1', side: 'A', purpose: 'claim', superseded: false, outcome: 'TEAM_A_WIN', level: 'yellow',
    reasons: ['EDITED_CELL', 'REPORTER_LOW_REPUTATION'], sets: [{ teamA: 21, teamB: 18 }, { teamA: 21, teamB: 16 }], editedCells: [], manualEntry: false,
    columnMappedBy: 'user', createdAt: '2026-10-22T13:12:00Z',
    images: [{
      id: 'e1', mimeType: 'image/jpeg', level: 'yellow', reasons: ['NEAR_DUPLICATE'], supports: 'TEAM_A_WIN', capturedAt: '2026-10-22T13:01:00Z', isScreenshot: false,
      exactDuplicateOf: null, nearDuplicateOf: { matchCode: 'KEO-00003870' },
      ai: { provider: 'gemini', model: 'gemini-3.5-flash-lite', confidence: 0.84, reading: { boards: 1, isScreenshot: false, columns: { left: null, right: null }, unreadable: false, sets: [{ index: 3, left: 21, right: 16, confLeft: 0.96, confRight: 0.84 }] } },
    }],
  }],
  rulings: [{ id: 'r1', tier: 2, outcome: 'TEAM_A_WIN', confidence: 0.88, reasons: [{ text: 'Lấy ảnh chụp muộn nhất.', citations: ['BR-RA-12'] }], adminNotes: 'Kiểm tra số sân trên ảnh.', citations: ['BR-RA-12'], provider: 'groq', model: 'gpt-oss-120b', publishedAt: '2026-10-22T15:42:00Z', appealedAt: '2026-10-23T00:10:00Z' }],
  appeals: [{ id: 'ap1', userId: 'b1', reason: 'Ảnh là sân bên cạnh', pointedReason: '1. Lấy ảnh chụp muộn nhất.', evidenceIds: ['e9'], accepted: true, createdAt: '2026-10-23T00:10:00Z' }],
} as unknown as ReviewCaseDetail

it('A1 filters the admin queue by reason and shows reason and level badges', async () => {
  vi.mocked(listAdminResultCases).mockResolvedValue({ items: [item()], total: 1, page: 1, pageSize: 10 })
  vi.mocked(getAdminResultCase).mockResolvedValue(photoDetail)
  render(<MemoryRouter><AdminMatchResultsPage /></MemoryRouter>)
  const queue = await screen.findByRole('list')
  expect(within(queue).getByText('Kháng nghị')).toBeInTheDocument()
  expect(within(queue).getByText('Vàng')).toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('group', { name: 'Lọc theo lý do' })).getByRole('button', { name: 'Ảnh lạ' }))
  await waitFor(() => expect(listAdminResultCases).toHaveBeenLastCalledWith(1, 'admin_review', { reason: 'unknown_photo', level: '' }))
})

it('A2/A3 shows photo claims, AI ruling with admin notes, appeal and reputation; decides with appeal grounding and a violation', async () => {
  vi.mocked(listAdminResultCases).mockResolvedValue({ items: [item()], total: 1, page: 1, pageSize: 10 })
  vi.mocked(getAdminResultCase).mockResolvedValue(photoDetail)
  vi.mocked(readResultEvidence).mockResolvedValue({ url: 'https://signed/e1' } as never)
  vi.mocked(previewAdminDecision).mockResolvedValue({ caseVersion: 5, previewToken: 'tok', outcome: 'TEAM_A_WIN', reason: 'Giữ nguyên', rows: [], ratingEffect: 'apply_ranked_result', bookingRevenueEffect: 'no_change' })
  vi.mocked(decideAdminResultV2).mockResolvedValue({})
  render(<MemoryRouter><AdminMatchResultsPage /></MemoryRouter>)
  expect(await screen.findByText('Người khai uy tín Thấp (nội bộ)', { exact: false })).toBeInTheDocument()
  expect(screen.getByText('Cần chú ý')).toBeInTheDocument()
  expect(screen.getByText(/Kiểm tra số sân trên ảnh/)).toBeInTheDocument()
  expect(screen.getByText('“Ảnh là sân bên cạnh”')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /Ảnh 1/ }))
  expect(await screen.findByText('Gần trùng ảnh của KEO-00003870')).toBeInTheDocument()
  expect(screen.getByText('0.96 / 0.84')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Đóng hộp thoại' }))

  fireEvent.click(screen.getByRole('radio', { name: /Tuấn Anh/ }))
  fireEvent.change(screen.getByLabelText('Lý do quyết định cuối'), { target: { value: 'Giữ nguyên' } })
  fireEvent.click(screen.getByRole('button', { name: 'Không có căn cứ' }))
  fireEvent.change(screen.getByLabelText('Vi phạm của Minh Khôi'), { target: { value: 'near_duplicate_fraud' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xem trước tác động' }))
  await waitFor(() => expect(previewAdminDecision).toHaveBeenCalled())
  fireEvent.click(await screen.findByRole('checkbox', { name: /Tôi đã kiểm tra/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận quyết định cuối' }))
  await waitFor(() => expect(decideAdminResultV2).toHaveBeenCalledWith('m1', {
    outcome: 'TEAM_A_WIN', reason: 'Giữ nguyên', caseVersion: 5, previewToken: 'tok', appealGrounded: false,
    violations: [{ userId: 'a2', kind: 'near_duplicate_fraud' }],
  }))
})

it('BO5: the admin case lists all five sets of a claim (mục 4)', async () => {
  const sets = [{ teamA: 21, teamB: 18 }, { teamA: 19, teamB: 21 }, { teamA: 21, teamB: 15 }, { teamA: 17, teamB: 21 }, { teamA: 21, teamB: 19 }]
  const base = photoDetail as unknown as { claimViews: Array<Record<string, unknown>>; match: Record<string, unknown> }
  vi.mocked(listAdminResultCases).mockResolvedValue({ items: [item()], total: 1, page: 1, pageSize: 10 })
  vi.mocked(getAdminResultCase).mockResolvedValue({ ...base, match: { ...base.match, format: 'bo5' }, claimViews: [{ ...base.claimViews[0], sets }] } as unknown as ReviewCaseDetail)
  render(<MemoryRouter><AdminMatchResultsPage /></MemoryRouter>)
  expect(await screen.findByText(/21–18, 19–21, 21–15, 17–21, 21–19/)).toBeInTheDocument()
  expect(screen.getByText(/Đội A thắng 3–2/)).toBeInTheDocument()
})
