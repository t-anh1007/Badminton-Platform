import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ManageMatchResultsPage } from './manage/ManageMatchResultsPage.js'
import { AdminMatchResultsPage } from './admin/AdminMatchResultsPage.js'
import {
  decideAdminResult, getAdminResultCase, getProviderResultCase, listAdminResultCases, listProviderResultCases, previewAdminDecision,
  readResultEvidence, submitProviderRecommendation, type ReviewCaseDetail, type ReviewQueueItem,
} from '../lib/matchApi.js'

vi.mock('../lib/matchApi.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/matchApi.js')>()),
  listProviderResultCases: vi.fn(), getProviderResultCase: vi.fn(), submitProviderRecommendation: vi.fn(),
  listAdminResultCases: vi.fn(), getAdminResultCase: vi.fn(), previewAdminDecision: vi.fn(), decideAdminResult: vi.fn(), readResultEvidence: vi.fn(),
}))

const person = (userId: string, displayName: string) => ({ userId, displayName, avatarUrl: null })
const item = (caseId: string, overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem => ({
  caseId, matchId: `match-${caseId}`, matchCode: null, bookingCode: null, venueName: null, courtName: null, status: 'provider_review', version: 3, discipline: 'singles', mode: 'ranked',
  startAt: '2026-09-26T11:00:00Z', endAt: '2026-09-26T12:00:00Z', providerDeadlineAt: new Date(Date.now() + 3_600_000).toISOString(),
  adminReviewStartedAt: null, adminOverdue: false, ...overrides,
})
const detail = (overrides: Partial<ReviewCaseDetail> = {}): ReviewCaseDetail => ({
  ...item('c1'), serverNow: new Date().toISOString(), declarationDeadlineAt: '2026-09-26T23:00:00Z', objectionDeadlineAt: null, incidentDeadlineAt: null,
  booking: { startAt: '2026-09-26T11:00:00Z', endAt: '2026-09-26T12:00:00Z', venue: { name: 'Nhà thi đấu Quận 7', address: '123' }, court: { name: 'Sân 03' } },
  match: { discipline: 'singles', mode: 'ranked', format: 'bo3', ratio: '5:5', teams: [{ side: 'A', players: [person('u1', 'Minh Anh')] }, { side: 'B', players: [person('u2', 'Phúc Nguyễn')] }] },
  claims: [{ id: 'cl1', claimant: person('u1', 'Minh Anh'), outcome: 'TEAM_A_WIN', sets: [{ teamA: 21, teamB: 15 }, { teamA: 21, teamB: 18 }], evidenceIds: ['e1'], createdAt: '2026-09-26T12:10:00Z' }],
  responses: [{ id: 'r1', user: person('u2', 'Phúc Nguyễn'), kind: 'object', incidentType: null, reason: 'Set 2 sai', evidenceIds: [], createdAt: '2026-09-26T13:00:00Z' }],
  supplementalEvidence: [], providerRecommendation: null, actions: { canRecommend: true },
  ...overrides,
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('provider pages the queue, reads evidence privately and sends a non-binding recommendation', async () => {
  vi.mocked(listProviderResultCases).mockResolvedValue({ items: [item('c1')], total: 11, page: 1, pageSize: 10 })
  vi.mocked(getProviderResultCase).mockResolvedValue(detail())
  vi.mocked(readResultEvidence).mockResolvedValue({ url: 'https://signed/e1' } as never)
  vi.mocked(submitProviderRecommendation).mockResolvedValue({})
  render(<MemoryRouter><ManageMatchResultsPage /></MemoryRouter>)
  expect(await screen.findByText('Set 2 sai')).toBeInTheDocument()
  expect(screen.getByText(/Đề xuất chưa có hiệu lực/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh 1' }))
  await waitFor(() => expect(readResultEvidence).toHaveBeenCalledWith('match-c1', 'e1'))
  fireEvent.click(screen.getByRole('button', { name: '›' }))
  await waitFor(() => expect(listProviderResultCases).toHaveBeenLastCalledWith(2, 'provider_review'))
  const send = screen.getByRole('button', { name: 'Gửi đề xuất cho quản trị viên' })
  expect(send).toBeDisabled()
  fireEvent.click(screen.getByRole('radio', { name: /Không có kết quả/ }))
  fireEvent.change(screen.getByLabelText('Lý do đề xuất'), { target: { value: 'Hai bên không thống nhất' } })
  vi.mocked(getProviderResultCase).mockResolvedValue(detail({ status: 'admin_review', actions: { canRecommend: false }, providerRecommendation: { outcome: 'NO_RESULT', reason: 'x', createdAt: '', nonBinding: true } }))
  fireEvent.click(send)
  await waitFor(() => expect(submitProviderRecommendation).toHaveBeenCalledWith('match-c1', { outcome: 'NO_RESULT', reason: 'Hai bên không thống nhất' }))
  expect(await screen.findByText('Chờ quản trị viên quyết định')).toBeInTheDocument()
  expect(screen.queryByText('Kết quả đã chốt')).not.toBeInTheDocument()
})

it('shows the provider conflict error instead of accepting the recommendation', async () => {
  vi.mocked(listProviderResultCases).mockResolvedValue({ items: [item('c1')], total: 1, page: 1, pageSize: 10 })
  vi.mocked(getProviderResultCase).mockResolvedValue(detail())
  vi.mocked(submitProviderRecommendation).mockRejectedValue(new Error('Chủ sân nằm trong kèo không được đề xuất kết quả.'))
  render(<MemoryRouter><ManageMatchResultsPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('radio', { name: /Minh Anh thắng/ }))
  fireEvent.change(screen.getByLabelText('Lý do đề xuất'), { target: { value: 'Theo ảnh' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất cho quản trị viên' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Chủ sân nằm trong kèo')
})

it('admin must preview the unchanged decision and tick the check before the final confirm; a version conflict forces a new preview', async () => {
  const adminDetail = detail({ status: 'admin_review', adminOverdue: true, actions: { canPreviewDecision: true },
    providerRecommendation: { outcome: 'NO_RESULT', reason: 'Không thống nhất', createdAt: '', nonBinding: true } })
  vi.mocked(listAdminResultCases).mockResolvedValue({ items: [item('c1', { status: 'admin_review', adminOverdue: true })], total: 1, page: 1, pageSize: 10 })
  vi.mocked(getAdminResultCase).mockResolvedValue(adminDetail)
  vi.mocked(previewAdminDecision).mockResolvedValue({
    caseVersion: 3, previewToken: 'tok', outcome: 'TEAM_A_WIN', reason: 'Ảnh bảng điểm rõ',
    rows: [{ userId: 'u1', displayName: 'Minh Anh', amount: '80000', withdrawable: true }, { userId: 'u2', displayName: 'Phúc Nguyễn', amount: '0', withdrawable: true }],
    ratingEffect: 'apply_ranked_result', bookingRevenueEffect: 'no_change',
  })
  render(<MemoryRouter><AdminMatchResultsPage /></MemoryRouter>)
  expect(await screen.findByText('Đề xuất - chưa có hiệu lực')).toBeInTheDocument()
  expect(screen.getAllByText('Quá hạn 48 giờ').length).toBeGreaterThan(1)
  const confirm = screen.getByRole('button', { name: 'Xác nhận quyết định cuối' })
  fireEvent.click(screen.getByRole('radio', { name: /Minh Anh thắng/ }))
  fireEvent.change(screen.getByLabelText('Lý do quyết định cuối'), { target: { value: 'Ảnh bảng điểm rõ' } })
  expect(confirm).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Xem trước tác động' }))
  expect(await screen.findByText('Minh Anh nhận lại')).toBeInTheDocument()
  expect(screen.getByText('Cập nhật theo kết quả')).toBeInTheDocument()
  expect(confirm).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(confirm).toBeEnabled()
  // Đổi lựa chọn sau khi xem trước thì phải xem trước lại.
  fireEvent.click(screen.getByRole('radio', { name: /Phúc Nguyễn thắng/ }))
  expect(confirm).toBeDisabled()
  fireEvent.click(screen.getByRole('radio', { name: /Minh Anh thắng/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Xem trước tác động' }))
  await screen.findByText('Minh Anh nhận lại')
  fireEvent.click(screen.getByRole('checkbox'))
  vi.mocked(decideAdminResult).mockRejectedValueOnce(new Error('Hồ sơ đã thay đổi; hãy xem lại tác động trước khi xác nhận.'))
  fireEvent.click(confirm)
  await waitFor(() => expect(decideAdminResult).toHaveBeenCalledWith('match-c1', { outcome: 'TEAM_A_WIN', reason: 'Ảnh bảng điểm rõ', caseVersion: 3, previewToken: 'tok' }))
  expect(await screen.findByText(/Hồ sơ đã thay đổi/)).toBeInTheDocument()
  expect(screen.queryByText('Minh Anh nhận lại')).not.toBeInTheDocument()
  expect(confirm).toBeDisabled()
  expect(within(screen.getByRole('list', { name: 'Các bước quyết định' })).getAllByRole('listitem')).toHaveLength(3)
})

it('opens the case from the notification link even when it is not on the current queue page', async () => {
  vi.mocked(listAdminResultCases).mockResolvedValue({ items: [item('c1', { status: 'admin_review' })], total: 12, page: 1, pageSize: 10 })
  vi.mocked(getAdminResultCase).mockResolvedValue(detail({ caseId: 'c9', matchId: 'match-c9', status: 'admin_review', actions: { canPreviewDecision: true } }))
  render(<MemoryRouter initialEntries={['/admin/match-results?caseId=c9']}><AdminMatchResultsPage /></MemoryRouter>)
  await waitFor(() => expect(getAdminResultCase).toHaveBeenCalledWith('c9'))
  expect(getAdminResultCase).not.toHaveBeenCalledWith('c1')

  cleanup()
  vi.mocked(listProviderResultCases).mockResolvedValue({ items: [item('c1')], total: 1, page: 1, pageSize: 10 })
  vi.mocked(getProviderResultCase).mockResolvedValue(detail({ caseId: 'c7' }))
  render(<MemoryRouter initialEntries={['/manage/match-results?caseId=c7']}><ManageMatchResultsPage /></MemoryRouter>)
  await waitFor(() => expect(getProviderResultCase).toHaveBeenCalledWith('c7'))
  expect(getProviderResultCase).not.toHaveBeenCalledWith('c1')
})

it('lets provider and Admin switch to processed cases through the status filter', async () => {
  vi.mocked(listAdminResultCases).mockResolvedValue({ items: [item('c5', { status: 'final' })], total: 1, page: 1, pageSize: 10 })
  vi.mocked(getAdminResultCase).mockResolvedValue(detail({ caseId: 'c5', status: 'final', actions: { canPreviewDecision: false } }))
  render(<MemoryRouter><AdminMatchResultsPage /></MemoryRouter>)
  await waitFor(() => expect(listAdminResultCases).toHaveBeenLastCalledWith(1, 'admin_review'))
  fireEvent.change(screen.getByLabelText('Trạng thái hồ sơ'), { target: { value: 'final' } })
  await waitFor(() => expect(listAdminResultCases).toHaveBeenLastCalledWith(1, 'final'))
  expect(await screen.findByText('Hồ sơ không còn ở bước quản trị viên quyết định.')).toBeInTheDocument()

  cleanup()
  vi.mocked(listProviderResultCases).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 })
  render(<MemoryRouter><ManageMatchResultsPage /></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText('Trạng thái hồ sơ'), { target: { value: 'admin_review' } })
  await waitFor(() => expect(listProviderResultCases).toHaveBeenLastCalledWith(1, 'admin_review'))
  expect(await screen.findByText('Không có hồ sơ nào ở trạng thái này.')).toBeInTheDocument()
})
