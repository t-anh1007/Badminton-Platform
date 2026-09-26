import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EXPIRED_REFETCH_MS, MatchResultFlow } from './MatchResultFlow.js'
import { publishDataInvalidation } from '../realtime/dataInvalidation.js'
import { getResultCase, objectMatchResult, readResultEvidence, reportMatchIncident, submitResultClaim, supplementResultEvidence, type PlayerResultCase } from '../lib/matchApi.js'

vi.mock('../lib/matchApi.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/matchApi.js')>()),
  getResultCase: vi.fn(), submitResultClaim: vi.fn().mockResolvedValue({}), confirmMatchResult: vi.fn().mockResolvedValue({}),
  objectMatchResult: vi.fn().mockResolvedValue({}), authorizeResultEvidence: vi.fn(), supplementResultEvidence: vi.fn().mockResolvedValue({}), readResultEvidence: vi.fn(), reportMatchIncident: vi.fn(),
}))
// Picker thật đã có test riêng; ở đây chỉ cần một ảnh đã tải kèm checksum.
vi.mock('./CommunityComposer.js', () => ({
  ImageUploadPicker: ({ label, onUploadedChange }: { label: string; onUploadedChange: (items: unknown[]) => void }) => {
    const done = { status: 'uploaded', objectKey: 'match/results/k1', checksumSha256: 'c1', file: { type: 'image/png' } }
    return (
      <>
        <button type="button" onClick={() => onUploadedChange([done])}>{label}</button>
        <button type="button" onClick={() => onUploadedChange([done, { status: 'uploading', file: { type: 'image/png' } }])}>{`${label} - còn ảnh đang tải`}</button>
      </>
    )
  },
}))

const person = (userId: string, displayName: string) => ({ userId, displayName, avatarUrl: null })
const resultCase = (overrides: Partial<PlayerResultCase> = {}): PlayerResultCase => ({
  matchId: 'm1', serverNow: new Date().toISOString(), status: 'declaration_open', finalOutcome: null,
  declarationDeadlineAt: new Date(Date.now() + 3_600_000).toISOString(), objectionDeadlineAt: null, teamGraceDeadlineAt: null,
  match: {
    discipline: 'singles', mode: 'ranked', format: 'bo3', ratio: '7:3', startAt: '2026-09-26T11:00:00Z', endAt: '2026-09-26T12:00:00Z',
    venue: { name: 'Nhà thi đấu Quận 7', address: '123 Nguyễn Thị Thập' }, court: { name: 'Sân 3' },
    teams: [{ side: 'A', players: [person('u1', 'Minh Anh')] }, { side: 'B', players: [person('u2', 'Hoàng Nam')] }],
  },
  provisional: null,
  viewerActions: { canClaim: true, canConfirm: false, canObject: false, canReportIncident: false },
  viewerMoney: null,
  ...overrides,
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('infers the winner from entered sets and submits only played sets with checksummed evidence', async () => {
  vi.mocked(getResultCase).mockResolvedValue(resultCase())
  render(<MatchResultFlow matchId="m1" />)
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
  await screen.findByLabelText('Set 1 Minh Anh')
  type('Set 1 Minh Anh', '21')
  type('Set 1 Hoàng Nam', '15')
  type('Set 2 Minh Anh', '21')
  type('Set 2 Hoàng Nam', '18')
  expect(screen.getByText('Hệ thống xác định từ tỷ số đã nhập: Minh Anh thắng 2-0')).toBeInTheDocument()
  const submit = screen.getByRole('button', { name: 'Gửi kết quả' })
  expect(submit).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Thêm ảnh bảng điểm hoặc ảnh tại sân' }))
  fireEvent.click(submit)
  await waitFor(() => expect(submitResultClaim).toHaveBeenCalledWith('m1', {
    sets: [{ teamA: 21, teamB: 15 }, { teamA: 21, teamB: 18 }],
    evidence: [{ objectKey: 'match/results/k1', mimeType: 'image/png', checksumSha256: 'c1' }],
  }))
})

it('requires a reason and evidence before sending an objection', async () => {
  vi.mocked(getResultCase).mockResolvedValue(resultCase({
    status: 'provisional', declarationDeadlineAt: null, objectionDeadlineAt: new Date(Date.now() + 3_600_000).toISOString(),
    provisional: { claimant: person('u1', 'Minh Anh'), sets: [{ teamA: 21, teamB: 15 }, { teamA: 21, teamB: 18 }], outcome: 'TEAM_A_WIN', evidence: [] },
    viewerActions: { canClaim: false, canConfirm: true, canObject: true, canReportIncident: false },
  }))
  render(<MatchResultFlow matchId="m1" />)
  fireEvent.click(await screen.findByRole('radio', { name: /Tôi muốn khiếu nại/ }))
  const send = screen.getByRole('button', { name: 'Gửi phản hồi' })
  expect(send).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Lý do khiếu nại'), { target: { value: 'Set 2 là 19-21' } })
  expect(send).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Thêm ảnh minh chứng' }))
  fireEvent.click(send)
  await waitFor(() => expect(objectMatchResult).toHaveBeenCalledWith('m1', {
    reason: 'Set 2 là 19-21', evidence: [{ objectKey: 'match/results/k1', mimeType: 'image/png', checksumSha256: 'c1' }],
  }))
})

it('shows the final result without a countdown or claim form', async () => {
  vi.mocked(getResultCase).mockResolvedValue(resultCase({
    status: 'final', finalOutcome: 'TEAM_B_WIN', declarationDeadlineAt: null,
    viewerActions: { canClaim: false, canConfirm: false, canObject: false, canReportIncident: false },
  }))
  render(<MatchResultFlow matchId="m1" />)
  expect(await screen.findByText('Kết quả đã chốt')).toBeInTheDocument()
  expect(screen.getByText('Hoàng Nam thắng')).toBeInTheDocument()
  expect(screen.queryByText(/Thời hạn/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Gửi kết quả' })).not.toBeInTheDocument()
})

it('opens private evidence only through a signed read on request', async () => {
  vi.mocked(readResultEvidence).mockResolvedValue({ url: 'https://signed.example/e1' } as never)
  vi.mocked(getResultCase).mockResolvedValue(resultCase({
    status: 'provisional', declarationDeadlineAt: null, objectionDeadlineAt: new Date(Date.now() + 3_600_000).toISOString(),
    provisional: { claimant: person('u1', 'Minh Anh'), sets: [{ teamA: 21, teamB: 15 }, { teamA: 21, teamB: 18 }], outcome: 'TEAM_A_WIN', evidence: [{ id: 'e1', mimeType: 'image/png' }] },
    viewerActions: { canClaim: false, canConfirm: true, canObject: true, canReportIncident: false },
  }))
  render(<MatchResultFlow matchId="m1" />)
  expect(document.querySelector('img')).toBeNull()
  fireEvent.click(await screen.findByRole('button', { name: 'Xem ảnh 1' }))
  await waitFor(() => expect(readResultEvidence).toHaveBeenCalledWith('m1', 'e1'))
  expect(await screen.findByRole('img', { name: 'Ảnh minh chứng 1' })).toHaveAttribute('src', 'https://signed.example/e1')
})

it('reports an incident by type without asking for a winner, even before a result case exists', async () => {
  vi.mocked(getResultCase).mockRejectedValue(new Error('not found'))
  vi.mocked(reportMatchIncident).mockResolvedValue({} as never)
  render(<MatchResultFlow matchId="m1" allowIncident />)
  fireEvent.click(await screen.findByRole('button', { name: 'Báo sự cố trận đấu' }))
  expect(screen.getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual(
    expect.arrayContaining([expect.stringContaining('Một bên không đến'), expect.stringContaining('Trận không diễn ra'), expect.stringContaining('Trận bị gián đoạn'), expect.stringContaining('Vấn đề khác')]),
  )
  expect(screen.queryByRole('radio', { name: /thắng/i })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: /Một bên không đến/ }))
  fireEvent.change(screen.getByLabelText('Mô tả sự việc'), { target: { value: 'Đối thủ không đến sân' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm ảnh minh chứng' }))
  fireEvent.click(screen.getByRole('button', { name: 'Gửi báo sự cố' }))
  await waitFor(() => expect(reportMatchIncident).toHaveBeenCalledWith('m1', {
    type: 'no_show', description: 'Đối thủ không đến sân', evidence: [{ objectKey: 'match/results/k1', mimeType: 'image/png', checksumSha256: 'c1' }],
  }))
})

it('keeps the submit disabled while any chosen image is still uploading', async () => {
  vi.mocked(getResultCase).mockResolvedValue(resultCase())
  render(<MatchResultFlow matchId="m1" />)
  await screen.findByLabelText('Set 1 Minh Anh')
  fireEvent.change(screen.getByLabelText('Set 1 Minh Anh'), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText('Set 1 Hoàng Nam'), { target: { value: '15' } })
  fireEvent.change(screen.getByLabelText('Set 2 Minh Anh'), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText('Set 2 Hoàng Nam'), { target: { value: '18' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm ảnh bảng điểm hoặc ảnh tại sân - còn ảnh đang tải' }))
  expect(screen.getByRole('button', { name: 'Gửi kết quả' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Thêm ảnh bảng điểm hoặc ảnh tại sân' }))
  expect(screen.getByRole('button', { name: 'Gửi kết quả' })).toBeEnabled()
})

it('lets a roster member add evidence while the case is under review', async () => {
  vi.mocked(getResultCase).mockResolvedValue(resultCase({
    status: 'provider_review', declarationDeadlineAt: null,
    viewerActions: { canClaim: false, canConfirm: false, canObject: false, canReportIncident: false },
  }))
  render(<MatchResultFlow matchId="m1" />)
  const send = await screen.findByRole('button', { name: 'Gửi ảnh bổ sung' })
  expect(send).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Thêm ảnh bổ sung' }))
  fireEvent.click(send)
  await waitFor(() => expect(supplementResultEvidence).toHaveBeenCalledWith('m1', [{ objectKey: 'match/results/k1', mimeType: 'image/png', checksumSha256: 'c1' }]))
})

it('refetches when a realtime notification arrives', async () => {
  vi.mocked(getResultCase).mockResolvedValue(resultCase())
  render(<MatchResultFlow matchId="m1" />)
  await screen.findByLabelText('Set 1 Minh Anh')
  const calls = vi.mocked(getResultCase).mock.calls.length
  publishDataInvalidation('notification')
  await waitFor(() => expect(vi.mocked(getResultCase).mock.calls.length).toBeGreaterThan(calls))
})

it('keeps asking the server after the deadline until the status moves', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    // Hạn đã qua nhưng scheduler chưa chạy: server vẫn trả trạng thái cũ.
    vi.mocked(getResultCase).mockResolvedValue(resultCase({ declarationDeadlineAt: new Date(Date.now() - 1_000).toISOString() }))
    render(<MatchResultFlow matchId="m1" />)
    await screen.findByLabelText('Set 1 Minh Anh')
    const calls = vi.mocked(getResultCase).mock.calls.length
    await vi.advanceTimersByTimeAsync(EXPIRED_REFETCH_MS * 2 + 100)
    expect(vi.mocked(getResultCase).mock.calls.length).toBeGreaterThanOrEqual(calls + 2)
  } finally {
    vi.useRealTimers()
  }
})
