import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MatchResultPanel } from '../MatchResultPanel';
import { acceptRuling, markEvidenceDone, readResultPhoto, submitAppeal, type ResultRuling } from '../../../lib/resultApi';
import { MatchApiError } from '../../../lib/matchApi';
import { claimView, photoCase, vn } from '../testFixtures';

vi.mock('../../../lib/resultApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/resultApi')>()),
  acceptRuling: vi.fn(), markEvidenceDone: vi.fn(), submitAppeal: vi.fn(), readResultPhoto: vi.fn(), readResultPhotos: vi.fn(),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const reload = vi.fn().mockResolvedValue(undefined);
const actions = photoCase().viewerActions;

const ruling = (patch: Partial<ResultRuling> = {}): ResultRuling => ({
  id: 'r1', tier: 1, outcome: 'TEAM_A_WIN', publishedAt: vn('2026-10-22T22:41:00'),
  reasons: [{ text: 'Chỉ Đội A thắng có ảnh hợp lệ.', citations: ['BR-RA-31'] }],
  citations: [{ id: 'BR-RA-31', title: 'Luật 31', excerpt: 'Chỉ một bên thắng có bằng chứng hợp lệ → kết quả tạm theo bên đó.' }],
  ...patch,
});
const disputed = {
  proposalClaimId: 'c1', claims: [claimView()], level: 'yellow' as const,
  responses: [{ userId: 'b1', displayName: 'Lan Phương', kind: 'object' as const, createdAt: vn('2026-10-22T20:40:00') }],
  evidenceDeadlineAt: vn('2026-10-22T22:40:00'),
};

it('T1 keeps the other team photos sealed and marks my team done', async () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  vi.mocked(markEvidenceDone).mockResolvedValue({ bothTeamsDone: false });
  render(<MatchResultPanel matchId="m1" reload={reload} resultCase={photoCase({
    ...disputed, status: 'evidence_window', serverNow: vn('2026-10-22T21:06:00'), evidenceDoneSides: ['B'],
    viewerActions: { ...actions, canSubmitEvidence: true, canMarkEvidenceDone: true },
    viewerQuota: { photosUsed: 3, photosLimit: 7, draftsLeft: 12 },
  })} />);
  expect(screen.getByText('Đang tranh chấp tỉ số')).toBeInTheDocument();
  expect(screen.getByText('Giữ kín tới 22:40 22/10')).toBeInTheDocument();
  expect(screen.getByText('Đã nộp đủ')).toBeInTheDocument();
  expect(screen.getByText('4/7')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Đội tôi đã nộp đủ' }));
  await waitFor(() => expect(markEvidenceDone).toHaveBeenCalledWith('m1'));
});

it('T2 shows the rule-based provisional result with a readable citation and lets the loser accept it', async () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  vi.mocked(acceptRuling).mockResolvedValue({});
  render(<MatchResultPanel matchId="m1" reload={reload} resultCase={photoCase({
    ...disputed, status: 'appeal_window', ruling: ruling(), viewerSide: 'B', appealDeadlineAt: vn('2026-10-23T08:00:00'),
    serverNow: vn('2026-10-22T22:45:00'), viewerActions: { ...actions, canAppeal: true, canAcceptRuling: true },
  })} />);
  expect(screen.getByText('Kết quả tạm theo luật bằng chứng')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Luật 31' }));
  expect(within(screen.getByRole('region', { name: 'Luật 31' })).getByText(/Chỉ một bên thắng có bằng chứng hợp lệ/)).toBeInTheDocument();
  expect(screen.getAllByText('Dời sang 08:00')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận kết quả' }));
  await waitFor(() => expect(acceptRuling).toHaveBeenCalledWith('m1', 'r1'));
});

it('T3 labels the AI ruling and hides appeal buttons from the winning team', () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  render(<MatchResultPanel matchId="m1" reload={reload} resultCase={photoCase({
    ...disputed, status: 'appeal_window', ruling: ruling({ tier: 2 }), appealDeadlineAt: vn('2026-10-23T08:00:00'), viewerSide: 'A',
  })} />);
  expect(screen.getByText('Do AI soạn')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Kháng nghị' })).not.toBeInTheDocument();
  expect(screen.getByText(/Chỉ Đội B được kháng nghị/)).toBeInTheDocument();
});

it('T4 sends the pointed reasons and shows the grounds error by code', async () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  vi.mocked(submitAppeal).mockRejectedValueOnce(new MatchApiError('x', 400, 'RESULT_APPEAL_GROUNDS_REQUIRED')).mockResolvedValueOnce({});
  render(<MatchResultPanel matchId="m1" reload={reload} resultCase={photoCase({
    ...disputed, status: 'appeal_window', ruling: ruling({ tier: 2 }), viewerSide: 'B', appealDeadlineAt: vn('2026-10-23T08:00:00'),
    viewerActions: { ...actions, canAppeal: true, canAcceptRuling: true },
  })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kháng nghị' }));
  fireEvent.change(screen.getByLabelText('Vì sao sai?'), { target: { value: 'Ảnh là sân bên cạnh' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi kháng nghị' }));
  expect(await screen.findByText('Chọn lý do sai trong phán quyết hoặc thêm ảnh mới để gửi kháng nghị.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: /Chỉ Đội A thắng có ảnh hợp lệ/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Gửi kháng nghị' }));
  await waitFor(() => expect(submitAppeal).toHaveBeenLastCalledWith('m1', {
    rulingId: 'r1', reason: 'Ảnh là sân bên cạnh', pointedReason: '1. Chỉ Đội A thắng có ảnh hợp lệ.', files: [],
  }));
});

it('T5 explains why the case is with Admin and when a decision is due', () => {
  render(<MatchResultPanel matchId="m1" reload={reload} resultCase={photoCase({
    ...disputed, status: 'admin_review', ruling: ruling({ tier: 2 }), adminReason: 'appeal', adminReviewStartedAt: vn('2026-10-23T07:10:00'),
    viewerAppeal: { accepted: true, createdAt: vn('2026-10-23T07:10:00') },
  })} />);
  expect(screen.getByText('Có kháng nghị nên quản trị viên xem xét lại.')).toBeInTheDocument();
  expect(screen.getAllByText(/07:10 25\/10/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Bạn đã kháng nghị lúc 07:10 23\/10/)).toBeInTheDocument();
});

it('shows the final result', () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  render(<MatchResultPanel matchId="m1" reload={reload} resultCase={photoCase({ ...disputed, status: 'final', finalOutcome: 'TEAM_A_WIN' })} />);
  expect(screen.getByText('Đội A thắng 2–1')).toBeInTheDocument();
  expect(screen.getAllByText('Đã chốt').length).toBeGreaterThan(0);
});

it('shows the Admin decision reason on the final result (mục 1)', () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  render(<MatchResultPanel matchId="m1" reload={reload} resultCase={photoCase({
    ...disputed, status: 'final', finalOutcome: 'TEAM_A_WIN', adminReviewStartedAt: vn('2026-10-23T07:10:00'),
    adminDecision: { outcome: 'TEAM_A_WIN', reason: 'Giữ nguyên phán quyết tạm. Ảnh mới không phải sân khác.', decidedAt: vn('2026-10-23T15:20:00') },
  })} />);
  expect(screen.getByText('Quyết định của quản trị viên')).toBeInTheDocument();
  expect(screen.getByText('Giữ nguyên phán quyết tạm. Ảnh mới không phải sân khác.')).toBeInTheDocument();
  expect(screen.getByText(/Quyết định lúc 15:20 23\/10/)).toBeInTheDocument();
});
