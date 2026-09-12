import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminFinancePage } from './AdminFinancePage.js'
import { AdminDisputesPage } from './AdminDisputesPage.js'
import { AdminModerationPage } from './AdminModerationPage.js'
import { AdminEvaluationsPage } from './AdminEvaluationsPage.js'
import { AdminTicketsPage } from './AdminTicketsPage.js'
import { confirmManualWithdrawalPayout, finalizePartialWithdrawal, markOutOfScope, reconcileIncoming, reconcileOutgoing, rejectWithdrawal, resolveDispute } from '../../lib/financeApi.js'
import { moderateCommunityReport, restoreCommunityContent } from '../../lib/communityAdminApi.js'
import { getAdminEvaluations, reviewAdminEvaluation } from '../../lib/matchApi.js'
import { addSupportTicketMessage, getSupportTicket, listSupportTickets, setSupportTicketStatus } from '../../lib/communityApi.js'

vi.mock('../../lib/accountApi.js', () => ({
  getAdminAccountIdentities: vi.fn().mockResolvedValue([{ id: 'u1', email: 'owner@example.com', displayName: 'Chủ sân A' }, { id: 'u2', email: 'owner-2@example.com', displayName: 'Chủ sân B' }]),
}))

vi.mock('../../lib/financeApi.js', () => ({
  getAdminWithdrawals: vi.fn().mockResolvedValue([{ id: 'w1', sellerUserId: 'u1', amount: '200000', paidAmount: '0', status: 'pending', transferCode: 'RUT-2026-001', bankCode: 'VCB', bankAccountNumber: '***1234', bankAccountName: 'NGUYEN VAN A', createdAt: '2026-08-15T00:00:00Z', processedAt: null }, { id: 'w2', sellerUserId: 'u2', amount: '300000', paidAmount: '100000', status: 'partially_paid', transferCode: 'RUT-2026-002', bankCode: 'ACB', bankAccountNumber: '***5678', bankAccountName: 'TRAN VAN B', createdAt: '2026-08-16T00:00:00Z', processedAt: null }]),
  getReconciliationQueue: vi.fn().mockResolvedValue([{ id: 'rc1', direction: 'in', amount: '100000', rawRef: 'SEPAY-LONG-REFERENCE-001', receivedAt: '2026-08-15T00:00:00Z' }, { id: 'rc2', direction: 'out', amount: '200000', rawRef: 'BANK-LONG-REFERENCE-002', receivedAt: '2026-08-15T01:00:00Z' }]),
  rejectWithdrawal: vi.fn().mockResolvedValue({}), finalizePartialWithdrawal: vi.fn().mockResolvedValue({}), confirmManualWithdrawalPayout: vi.fn().mockResolvedValue({}),
  reconcileIncoming: vi.fn().mockResolvedValue({}), reconcileOutgoing: vi.fn().mockResolvedValue({}), markOutOfScope: vi.fn().mockResolvedValue({}),
  getAdminDisputes: vi.fn().mockResolvedValue([{ id: 'd1', bookingId: 'booking-uuid', raiserUserId: 'u1', reason: 'Sân đóng cửa', contactPhone: '0901234567', evidence: ['https://cdn.test/proof.webp'], status: 'open', resolution: null, resolutionAmount: null, deadlineAt: '2026-08-20T00:00:00Z', createdAt: '2026-08-15T00:00:00Z', resolvedAt: null, revenue: { gross: '200000', net: '180000', commission: '20000', endAt: '2026-08-15T00:00:00Z', releaseAt: '2026-08-16T00:00:00Z', releasedAt: null }, ledgerEntries: [] }]),
  resolveDispute: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../lib/communityAdminApi.js', () => ({
  getOpenCommunityReports: vi.fn().mockResolvedValue({ reports: [{ id: 'r1', reporterUserId: 'u1', targetType: 'post', targetId: 'post-uuid', reason: 'Spam quảng cáo', status: 'open', createdAt: '2026-08-15T00:00:00Z' }] }),
  moderateCommunityReport: vi.fn().mockResolvedValue({}), restoreCommunityContent: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../lib/matchApi.js', () => ({
  getAdminEvaluations: vi.fn().mockResolvedValue([{ id: 'e1', matchId: 'm1', perceivedTier: 'advanced', flagReason: 'outlier_median_2_tiers', reviewStatus: 'pending', createdAt: '2026-08-15T00:00:00Z', rater: { label: 'Người đánh giá' }, ratee: { label: 'Người được đánh giá' } }]),
  reviewAdminEvaluation: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../lib/communityApi.js', () => ({
  listSupportTickets: vi.fn().mockResolvedValue({ tickets: [{ id: 't1', requesterUserId: 'u1', subject: 'Không thanh toán được', status: 'open', createdAt: '2026-08-15T00:00:00Z' }] }),
  getSupportTicket: vi.fn().mockResolvedValue({ id: 't1', requesterUserId: 'u1', subject: 'Không thanh toán được', status: 'open', createdAt: '2026-08-15T00:00:00Z', messages: [{ id: 'tm1', ticketId: 't1', senderUserId: 'u1', senderRole: 'player', body: 'Ví bị lỗi', createdAt: '2026-08-15T00:00:00Z' }] }),
  addSupportTicketMessage: vi.fn().mockResolvedValue({}), setSupportTicketStatus: vi.fn().mockResolvedValue({}),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('requires a reason and confirmation before rejecting a withdrawal', async () => {
  render(<AdminFinancePage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Từ chối' }))
  expect(screen.getByLabelText('Lý do từ chối RUT-2026-001')).toBeVisible()
  expect(screen.queryByLabelText('Lý do xử lý tiền')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }))
  expect(screen.getByRole('status')).toHaveTextContent('Nhập lý do')
  fireEvent.change(screen.getByLabelText('Lý do từ chối RUT-2026-001'), { target: { value: 'Sai thông tin ngân hàng' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(rejectWithdrawal).toHaveBeenCalledWith('w1', 'Sai thông tin ngân hàng'))
})

it('shows a withdrawal QR with the remaining amount and transfer reference without marking it paid', async () => {
  render(<AdminFinancePage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Hiển thị mã QR RUT-2026-002' }))
  const dialog = screen.getByRole('dialog', { name: 'Quét QR chuyển tiền' })
  expect(within(dialog).getByText('200.000đ')).toBeInTheDocument()
  expect(within(dialog).getByText('RUT-2026-002')).toBeInTheDocument()
  expect(within(dialog).getByAltText('Mã VietQR chuyển 200.000đ nội dung RUT-2026-002')).toBeInTheDocument()
  expect(finalizePartialWithdrawal).not.toHaveBeenCalled()
  expect(rejectWithdrawal).not.toHaveBeenCalled()
})

it('records an externally transferred withdrawal only after a per-request reference and confirmation', async () => {
  render(<AdminFinancePage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Đã chuyển tiền RUT-2026-001' }))
  fireEvent.change(screen.getByLabelText('Mã tham chiếu/lý do chi RUT-2026-001'), { target: { value: 'MB-REF-20260912' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã chuyển tiền' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(confirmManualWithdrawalPayout).toHaveBeenCalledWith('w1', 'MB-REF-20260912'))
})

it('filters and sorts the finance operation queues', async () => {
  render(<AdminFinancePage />)
  expect((await screen.findAllByText('RUT-2026-001')).length).toBeGreaterThan(0)
  expect(screen.getByText('Chủ sân A')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Lọc trạng thái yêu cầu rút'), { target: { value: 'partially_paid' } })
  expect(screen.queryByText('RUT-2026-001')).not.toBeInTheDocument()
  expect(screen.getByText('RUT-2026-002')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Lọc trạng thái yêu cầu rút'), { target: { value: 'all' } })
  fireEvent.change(screen.getByLabelText('Tìm yêu cầu rút'), { target: { value: '***1234' } })
  expect(screen.getAllByText('RUT-2026-001').length).toBeGreaterThan(0)
  expect(screen.queryByText('RUT-2026-002')).not.toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Lọc hướng tiền'), { target: { value: 'out' } })
  expect(screen.getAllByText('200.000đ').length).toBeGreaterThan(0)
  expect(screen.queryByText('100.000đ')).not.toBeInTheDocument()
})

it('opens reconciliation controls only for the selected event and uses selectable targets', async () => {
  render(<AdminFinancePage />)
  expect(await screen.findByRole('button', { name: 'Gán yêu cầu rút' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Đối tượng gán')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Lý do đối soát')).not.toBeInTheDocument()

  const outgoingCard = screen.getByRole('button', { name: 'Gán yêu cầu rút' }).closest('article')!
  fireEvent.click(within(outgoingCard).getByRole('button', { name: 'Gán yêu cầu rút' }))
  expect(within(outgoingCard).getByLabelText('Chọn yêu cầu rút rc2')).toBeVisible()
  expect(within(outgoingCard).getByLabelText('Lý do đối soát rc2')).toBeVisible()
  expect(screen.queryByLabelText('Chọn người nhận rc1')).not.toBeInTheDocument()
  fireEvent.change(within(outgoingCard).getByLabelText('Chọn yêu cầu rút rc2'), { target: { value: 'w1' } })
  fireEvent.change(within(outgoingCard).getByLabelText('Lý do đối soát rc2'), { target: { value: 'Khớp chứng từ' } })
  fireEvent.click(within(outgoingCard).getByRole('button', { name: 'Xác nhận gán yêu cầu rút' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(reconcileOutgoing).toHaveBeenCalledWith('rc2', 'w1', 'Khớp chứng từ'))

  const incomingCard = screen.getByRole('button', { name: 'Gán ví cá nhân' }).closest('article')!
  fireEvent.click(within(incomingCard).getByRole('button', { name: 'Gán ví cá nhân' }))
  fireEvent.change(within(incomingCard).getByLabelText('Chọn người nhận rc1'), { target: { value: 'u1' } })
  fireEvent.change(within(incomingCard).getByLabelText('Lý do đối soát rc1'), { target: { value: 'Khớp ví người chơi' } })
  fireEvent.click(within(incomingCard).getByRole('button', { name: 'Xác nhận gán ví cá nhân' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(reconcileIncoming).toHaveBeenCalledWith('rc1', 'u1', 'Khớp ví người chơi'))
})

it('finalizes a partial withdrawal and supports out-of-scope reconciliation', async () => {
  render(<AdminFinancePage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Chốt mức đã chi' }))
  fireEvent.change(screen.getByLabelText('Lý do chốt mức đã chi RUT-2026-002'), { target: { value: 'Đối chiếu sao kê' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận chốt mức đã chi' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(finalizePartialWithdrawal).toHaveBeenCalledWith('w2', 'Đối chiếu sao kê'))

  const incomingEventCard = screen.getByRole('button', { name: 'Gán ví cá nhân' }).closest('article')!
  fireEvent.click(within(incomingEventCard).getByRole('button', { name: 'Ngoài phạm vi' }))
  fireEvent.change(within(incomingEventCard).getByLabelText('Lý do đối soát rc1'), { target: { value: 'Không liên quan nền tảng' } })
  fireEvent.click(within(incomingEventCard).getByRole('button', { name: 'Xác nhận ngoài phạm vi' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(markOutOfScope).toHaveBeenCalledWith('rc1', 'Không liên quan nền tảng'))
})

it('submits a validated partial-refund dispute decision', async () => {
  render(<AdminDisputesPage />)
  expect(await screen.findByRole('link', { name: '0901234567' })).toHaveAttribute('href', 'tel:0901234567')
  expect(screen.getByAltText('Bằng chứng 1')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'Hoàn một phần' }))
  fireEvent.change(screen.getByLabelText('Số tiền hoàn một phần cho tranh chấp'), { target: { value: '90000' } })
  fireEvent.change(screen.getByLabelText('Lý do quyết định tranh chấp'), { target: { value: 'Hoàn một nửa do lỗi sân' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xem lại & xác nhận' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận quyết định' }))
  await waitFor(() => expect(resolveDispute).toHaveBeenCalledWith('d1', { decision: 'partial_refund', amount: '90000', reason: 'Hoàn một nửa do lỗi sân' }))
})

it('can hide then explicitly restore recently moderated content', async () => {
  render(<AdminModerationPage />)
  fireEvent.change(await screen.findByLabelText('Lý do quyết định kiểm duyệt'), { target: { value: 'Ẩn để xác minh' } })
  fireEvent.click(screen.getByRole('button', { name: 'Ẩn tạm' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(moderateCommunityReport).toHaveBeenCalledWith('r1', 'hide', 'Ẩn để xác minh'))
  fireEvent.click(await screen.findByRole('button', { name: 'Khôi phục nội dung vừa xử lý' }))
  await waitFor(() => expect(restoreCommunityContent).toHaveBeenCalledWith('post', 'post-uuid', 'Ẩn để xác minh'))
})

it.each([['Bác báo cáo', 'dismiss'], ['Gỡ nội dung', 'remove']] as const)('supports moderation action %s', async (buttonName, action) => {
  render(<AdminModerationPage />)
  fireEvent.change(await screen.findByLabelText('Lý do quyết định kiểm duyệt'), { target: { value: 'Quyết định có căn cứ' } })
  fireEvent.click(screen.getByRole('button', { name: buttonName }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(moderateCommunityReport).toHaveBeenCalledWith('r1', action, 'Quyết định có căn cứ'))
})

it('reviews a flagged evaluation only after confirmation', async () => {
  render(<AdminEvaluationsPage />)
  expect(await screen.findByText('Người đánh giá → Người được đánh giá')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Chấp thuận đánh giá' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(reviewAdminEvaluation).toHaveBeenCalledWith('m1', 'e1', 'approve'))
  expect(getAdminEvaluations).toHaveBeenCalledWith('pending')
})

it('can reject a flagged evaluation after confirmation', async () => {
  render(<AdminEvaluationsPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Từ chối đánh giá' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(reviewAdminEvaluation).toHaveBeenCalledWith('m1', 'e1', 'reject'))
})

it('lets an admin reply and resolve a support ticket without showing its UUID', async () => {
  render(<AdminTicketsPage />)
  expect(await screen.findAllByText('Không thanh toán được')).toHaveLength(2)
  expect(screen.queryByText('t1')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Nội dung phản hồi hỗ trợ'), { target: { value: 'Đội ngũ đang kiểm tra giao dịch.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }))
  await waitFor(() => expect(addSupportTicketMessage).toHaveBeenCalledWith('t1', 'Đội ngũ đang kiểm tra giao dịch.'))
  fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã giải quyết' }))
  await waitFor(() => expect(setSupportTicketStatus).toHaveBeenCalledWith('t1', 'resolved'))
})

it('closes a resolved support ticket', async () => {
  vi.mocked(listSupportTickets).mockResolvedValueOnce({ tickets: [{ id: 't2', requesterUserId: 'u2', subject: 'Đã hỗ trợ xong', status: 'resolved', createdAt: '2026-08-15T00:00:00Z' }] })
  vi.mocked(getSupportTicket).mockResolvedValueOnce({ id: 't2', requesterUserId: 'u2', subject: 'Đã hỗ trợ xong', status: 'resolved', createdAt: '2026-08-15T00:00:00Z', messages: [] })
  render(<AdminTicketsPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Đóng ticket' }))
  await waitFor(() => expect(setSupportTicketStatus).toHaveBeenCalledWith('t2', 'closed'))
})
