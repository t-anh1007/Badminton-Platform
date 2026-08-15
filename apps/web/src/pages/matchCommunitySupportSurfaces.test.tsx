import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MatchDetailPage } from './MatchDetailPage.js'
import { PassportPage } from './PassportPage.js'
import { CommunityPage } from './CommunityPage.js'
import { CommunityDetailPage } from './CommunityDetailPage.js'
import { SupportPage } from './SupportPage.js'
import { approveMatchJoin, cancelMatch, getMatchDetail, rejectMatchJoin, requestMatchJoin, withdrawMatchJoin } from '../lib/matchApi.js'
import { createMatchJoinSepayIntent, payMatchJoinBalance, payMatchOrganizerContributionBalance } from '../lib/financeApi.js'
import { submitMatchEvaluation } from '../lib/passportApi.js'
import {
  addSupportTicketMessage,
  createCommunityComment,
  createCommunityReport,
  createSupportTicket,
  editCommunityPost,
  removeCommunityComment,
  removeCommunityPost,
} from '../lib/communityApi.js'

vi.mock('../lib/matchApi.js', () => ({
  getMatchDetail: vi.fn(), listPendingMatchJoins: vi.fn().mockResolvedValue({ joins: [{ id: 'join-internal', status: 'pending', approvedAt: null, participantUserId: 'participant-internal-uuid', participantTier: 'intermediate', compatibilityScore: 84, compatibilityExplanation: 'Phù hợp bậc chơi' }] }),
  approveMatchJoin: vi.fn().mockResolvedValue({}), rejectMatchJoin: vi.fn().mockResolvedValue({}), requestMatchJoin: vi.fn().mockResolvedValue({}), withdrawMatchJoin: vi.fn().mockResolvedValue({}), cancelMatch: vi.fn().mockResolvedValue({}),
}))
vi.mock('../lib/financeApi.js', () => ({
  payMatchJoinBalance: vi.fn().mockResolvedValue({}), createMatchJoinSepayIntent: vi.fn().mockResolvedValue({ intentId: 'participant-intent-hidden', matchCode: 'KLTJOIN01', amount: '45000', payment: { bankCode: 'MBBank', accountNumber: '0123456789', accountName: 'CAU LONG PLATFORM', amount: '45000', matchCode: 'KLTJOIN01', qrImageUrl: 'https://qr.sepay.vn/img?acc=0123456789&bank=MBBank&amount=45000&des=KLTJOIN01' } }),
  payMatchOrganizerContributionBalance: vi.fn().mockResolvedValue({}), createMatchOrganizerContributionSepayIntent: vi.fn().mockResolvedValue({ intentId: 'organizer-intent-hidden', matchCode: 'KLTORG01', amount: '45000', payment: { bankCode: 'MBBank', accountNumber: '0123456789', accountName: 'CAU LONG PLATFORM', amount: '45000', matchCode: 'KLTORG01', qrImageUrl: 'https://qr.sepay.vn/img?acc=0123456789&bank=MBBank&amount=45000&des=KLTORG01' } }),
}))
vi.mock('../lib/passportApi.js', () => ({
  getOwnPassport: vi.fn().mockResolvedValue({ userId: 'owner-user-id', tier: 'intermediate', declaredTier: 'intermediate', matchesPlayed: 1, rating: 1500, rd: 80, sigma: 0.06, uncertainty: 'established', evaluationScore: null, evaluationCount: 0, flaggedEvaluationCount: 0, updatedAt: '2026-08-15T00:00:00Z', nextDeclarationAt: null, canDeclareTier: true, recentMatches: [{ id: 'match-id-must-not-render', bookingId: 'booking-id-must-not-render', completedAt: new Date().toISOString(), evaluationCandidates: [{ userId: 'candidate-id-must-not-render', submitted: false }] }] }),
  getPublicPassport: vi.fn(), declarePassportTier: vi.fn(), submitMatchEvaluation: vi.fn().mockResolvedValue({}),
}))
const { post, comment, ticket } = vi.hoisted(() => {
  const post = { id: 'post-internal-id', authorUserId: 'player-internal-uuid', body: 'Hẹn giao lưu cuối tuần', status: 'published', createdAt: '2026-08-15T00:00:00Z', editedAt: null, commentCount: 1, images: [] }
  const comment = { id: 'comment-internal-id', postId: post.id, authorUserId: 'player-internal-uuid', body: 'Tôi tham gia', status: 'published', createdAt: '2026-08-15T01:00:00Z' }
  const ticket = { id: 'ticket-internal-uuid', requesterUserId: 'player-internal-uuid', subject: 'Không thấy lịch đặt sân', status: 'open', createdAt: '2026-08-15T02:00:00Z' }
  return { post, comment, ticket }
})
vi.mock('../lib/communityApi.js', () => ({
  getCommunitySession: vi.fn(() => ({ userId: 'player-internal-uuid', roles: ['player'] })),
  listCommunityPosts: vi.fn().mockResolvedValue({ posts: [post] }),
  listOwnPosts: vi.fn().mockResolvedValue({ posts: [post] }),
  getCommunityPost: vi.fn().mockResolvedValue({ ...post, comments: [comment] }),
  createCommunityPost: vi.fn(), authorizeCommunityPostImage: vi.fn(), uploadAuthorizedFile: vi.fn(),
  editCommunityPost: vi.fn().mockResolvedValue({ ...post, body: 'Nội dung đã sửa', editedAt: '2026-08-15T03:00:00Z' }),
  removeCommunityPost: vi.fn().mockResolvedValue({ ...post, status: 'removed' }),
  createCommunityComment: vi.fn().mockResolvedValue({ ...comment, id: 'new-comment', body: 'Bình luận mới' }),
  removeCommunityComment: vi.fn().mockResolvedValue({ ...comment, status: 'removed' }),
  createCommunityReport: vi.fn().mockResolvedValue({ id: 'report-internal-id', reporterUserId: 'player-internal-uuid', targetType: 'post', targetId: post.id, reason: 'Nội dung quảng cáo', status: 'open', createdAt: '2026-08-15T03:00:00Z' }),
  listOwnReports: vi.fn().mockResolvedValue({ reports: [{ id: 'report-internal-id', reporterUserId: 'player-internal-uuid', targetType: 'post', targetId: post.id, reason: 'Nội dung quảng cáo', status: 'open', createdAt: '2026-08-15T03:00:00Z' }] }),
  listSupportTickets: vi.fn().mockResolvedValue({ tickets: [ticket] }),
  getSupportTicket: vi.fn().mockResolvedValue({ ...ticket, messages: [{ id: 'message-internal-id', ticketId: ticket.id, senderUserId: 'player-internal-uuid', senderRole: 'player', body: 'Nhờ kiểm tra giúp', createdAt: '2026-08-15T02:00:00Z' }] }),
  createSupportTicket: vi.fn().mockResolvedValue(ticket),
  addSupportTicketMessage: vi.fn().mockResolvedValue({ id: 'reply-id', ticketId: ticket.id, senderUserId: 'player-internal-uuid', senderRole: 'player', body: 'Tôi bổ sung thông tin', createdAt: '2026-08-15T04:00:00Z' }),
  setSupportTicketStatus: vi.fn(),
}))

const detail = (actions: Record<string, unknown>) => ({
  id: 'match-1', capacity: 4, openSlots: 2, feePerSlot: '45000', skillMin: 'beginner', skillMax: 'advanced', cutoffAt: '2026-08-15T08:00:00Z', startAt: '2026-08-15T09:00:00Z', endAt: '2026-08-15T10:00:00Z', court: { id: 'c1', name: 'Sân 1' }, venue: { id: 'v1', name: 'Nhà thi đấu A', address: 'Quận 1', lat: 10.8, lng: 106.6 }, status: 'open', organizer: { displayName: 'Organizer A', identityVisibility: 'public', tier: 'intermediate' }, confirmedParticipants: 0, actions,
})

beforeEach(() => {
  localStorage.setItem('accessToken', 'token')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

it('derives organizer join, payment and cancel controls from MatchDetail.actions without exposing participant IDs', async () => {
  vi.mocked(getMatchDetail).mockResolvedValue(detail({ canJoin: false, isOrganizer: true, canPayOrganizerContribution: true, ownJoin: null }) as never)
  render(<MemoryRouter initialEntries={['/matches/match-1']}><Routes><Route path="/matches/:id" element={<MatchDetailPage />} /></Routes></MemoryRouter>)
  expect(await screen.findByText('Người chơi đang chờ 1')).toBeInTheDocument()
  expect(screen.queryByText(/participant-internal-uuid/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }))
  await waitFor(() => expect(approveMatchJoin).toHaveBeenCalledWith('match-1', 'join-internal'))
  fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }))
  await waitFor(() => expect(rejectMatchJoin).toHaveBeenCalledWith('match-1', 'join-internal'))
  fireEvent.click(screen.getByRole('button', { name: 'Trả phần organizer' }))
  await waitFor(() => expect(payMatchOrganizerContributionBalance).toHaveBeenCalledWith('match-1'))
  fireEvent.change(screen.getByLabelText('Cách thanh toán phần organizer'), { target: { value: 'sepay' } })
  fireEvent.click(screen.getByRole('button', { name: 'Trả phần organizer' }))
  expect(await screen.findByText('KLTORG01')).toBeInTheDocument()
  expect(screen.queryByText('organizer-intent-hidden')).not.toBeInTheDocument()
  const organizerDialog = screen.getByText('KLTORG01').closest('[role="dialog"]') as HTMLElement
  fireEvent.click(within(organizerDialog).getAllByRole('button', { name: 'Chép' })[1]!)
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('KLTORG01'))
  const organizerPaymentDialog = screen.getByText('KLTORG01').closest('[role="dialog"]') as HTMLElement
  fireEvent.click(within(organizerPaymentDialog).getByRole('button', { name: 'Đóng hộp thoại' }))
  fireEvent.click(screen.getByRole('button', { name: 'Hủy kèo' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Xác nhận hủy kèo' })).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(cancelMatch).toHaveBeenCalledWith('match-1'))
})

it('requests a match join only when MatchDetail.actions allows it', async () => {
  vi.mocked(getMatchDetail).mockResolvedValue(detail({ canJoin: true, isOrganizer: false, canPayOrganizerContribution: false, ownJoin: null }) as never)
  render(<MemoryRouter initialEntries={['/matches/match-1']}><Routes><Route path="/matches/:id" element={<MatchDetailPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Gửi yêu cầu tham gia' }))
  await waitFor(() => expect(requestMatchJoin).toHaveBeenCalledWith('match-1'))
})

it('shows participant payment/withdraw controls only from ownJoin state', async () => {
  vi.mocked(getMatchDetail).mockResolvedValue(detail({ canJoin: false, isOrganizer: false, canPayOrganizerContribution: false, ownJoin: { id: 'own-join', status: 'approved', approvedAt: new Date().toISOString() } }) as never)
  render(<MemoryRouter initialEntries={['/matches/match-1']}><Routes><Route path="/matches/:id" element={<MatchDetailPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Trả phí tham gia' }))
  await waitFor(() => expect(payMatchJoinBalance).toHaveBeenCalledWith('match-1', 'own-join'))
  fireEvent.change(screen.getByLabelText('Cách thanh toán'), { target: { value: 'sepay' } })
  fireEvent.click(screen.getByRole('button', { name: 'Trả phí tham gia' }))
  await waitFor(() => expect(createMatchJoinSepayIntent).toHaveBeenCalledWith('match-1', 'own-join'))
  expect(await screen.findByText('KLTJOIN01')).toBeInTheDocument()

  vi.mocked(getMatchDetail).mockResolvedValue(detail({ canJoin: false, isOrganizer: false, canPayOrganizerContribution: false, ownJoin: { id: 'own-join', status: 'confirmed', approvedAt: new Date().toISOString() } }) as never)
  cleanup()
  render(<MemoryRouter initialEntries={['/matches/match-1']}><Routes><Route path="/matches/:id" element={<MatchDetailPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Rút khỏi kèo' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(withdrawMatchJoin).toHaveBeenCalledWith('match-1', 'own-join'))
})

it('submits post-match evaluation from a business label without rendering match, booking or player IDs', async () => {
  render(<MemoryRouter initialEntries={['/passport']}><Routes><Route path="/passport" element={<PassportPage />} /></Routes></MemoryRouter>)
  expect(await screen.findByText('Trận hoàn thành 1')).toBeInTheDocument()
  expect(screen.queryByText(/match-id-must-not-render|booking-id-must-not-render|candidate-id-must-not-render/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Đánh giá người cùng kèo 1' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gửi đánh giá' }))
  await waitFor(() => expect(submitMatchEvaluation).toHaveBeenCalledWith('match-id-must-not-render', 'candidate-id-must-not-render', 'intermediate'))
})

it('renders public and own Community activity with business labels and creates a report', async () => {
  render(<MemoryRouter initialEntries={['/community']}><Routes><Route path="/community" element={<CommunityPage />} /></Routes></MemoryRouter>)
  expect(await screen.findAllByText('Hẹn giao lưu cuối tuần')).not.toHaveLength(0)
  expect(await screen.findByText('Bài viết đã báo cáo')).toBeInTheDocument()
  expect(screen.queryByText(/player-internal-uuid|post-internal-id|report-internal-id/)).not.toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Báo cáo' })[0])
  const reportDialog = screen.getByRole('dialog', { name: 'Báo cáo nội dung' })
  fireEvent.change(within(reportDialog).getByPlaceholderText('Mô tả rõ nội dung cần xem xét'), { target: { value: 'Nội dung quảng cáo' } })
  fireEvent.click(within(reportDialog).getByRole('button', { name: 'Gửi báo cáo' }))
  await waitFor(() => expect(createCommunityReport).toHaveBeenCalledWith('post', post.id, 'Nội dung quảng cáo'))
})

it('keeps post/comment ownership actions inside Community detail cards', async () => {
  render(<MemoryRouter initialEntries={['/community/posts/post-internal-id']}><Routes><Route path="/community/posts/:postId" element={<CommunityDetailPage />} /><Route path="/community" element={<div>Đã về bảng tin</div>} /></Routes></MemoryRouter>)
  expect(await screen.findByText('Hẹn giao lưu cuối tuần')).toBeInTheDocument()
  expect(screen.getAllByText('Bạn').length).toBeGreaterThan(0)
  expect(screen.queryByText(/player-internal-uuid|comment-internal-id/)).not.toBeInTheDocument()

  fireEvent.change(screen.getByPlaceholderText('Viết bình luận công khai...'), { target: { value: 'Bình luận mới' } })
  fireEvent.click(screen.getByRole('button', { name: 'Bình luận' }))
  await waitFor(() => expect(createCommunityComment).toHaveBeenCalledWith(post.id, 'Bình luận mới'))

  fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }))
  const editDialog = screen.getByRole('dialog', { name: 'Chỉnh sửa bài viết' })
  fireEvent.change(within(editDialog).getByRole('textbox'), { target: { value: 'Nội dung đã sửa' } })
  fireEvent.click(within(editDialog).getByRole('button', { name: 'Lưu thay đổi' }))
  await waitFor(() => expect(editCommunityPost).toHaveBeenCalledWith(post.id, 'Nội dung đã sửa'))

  fireEvent.click(screen.getAllByRole('button', { name: 'Gỡ bình luận' })[0])
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Gỡ bình luận?' })).getByRole('button', { name: 'Gỡ bình luận' }))
  await waitFor(() => expect(removeCommunityComment).toHaveBeenCalledWith(comment.id))

  fireEvent.click(screen.getByRole('button', { name: 'Gỡ bài' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Gỡ bài viết?' })).getByRole('button', { name: 'Gỡ bài' }))
  await waitFor(() => expect(removeCommunityPost).toHaveBeenCalledWith(post.id))
})

it('supports player ticket list, detail, create and reply without exposing ticket IDs or admin transitions', async () => {
  render(<MemoryRouter initialEntries={['/support?ticket=ticket-internal-uuid']}><Routes><Route path="/support" element={<SupportPage />} /></Routes></MemoryRouter>)
  expect(await screen.findByText('Nhờ kiểm tra giúp')).toBeInTheDocument()
  expect(screen.queryByText(/ticket-internal-uuid|message-internal-id/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Đã giải quyết' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Đóng ticket' })).not.toBeInTheDocument()

  fireEvent.change(screen.getByPlaceholderText('Viết phản hồi bất đồng bộ...'), { target: { value: 'Tôi bổ sung thông tin' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }))
  await waitFor(() => expect(addSupportTicketMessage).toHaveBeenCalledWith(ticket.id, 'Tôi bổ sung thông tin'))

  fireEvent.click(screen.getByRole('button', { name: 'Tạo ticket mới' }))
  const createDialog = screen.getByRole('dialog', { name: 'Tạo ticket hỗ trợ' })
  fireEvent.change(within(createDialog).getByPlaceholderText('Ví dụ: Không thấy booking trong tài khoản'), { target: { value: 'Booking chưa hiển thị' } })
  fireEvent.change(within(createDialog).getByPlaceholderText('Mô tả điều đã xảy ra và thông tin liên quan'), { target: { value: 'Tôi đã thanh toán nhưng chưa thấy lịch.' } })
  fireEvent.click(within(createDialog).getByRole('button', { name: 'Gửi ticket' }))
  await waitFor(() => expect(createSupportTicket).toHaveBeenCalledWith('Booking chưa hiển thị', 'Tôi đã thanh toán nhưng chưa thấy lịch.'))
})
