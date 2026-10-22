import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MatchResultPanel } from '../MatchResultPanel';
import { confirmResultV2, objectResultV2, readResultPhoto } from '../../../lib/resultApi';
import { MatchApiError } from '../../../lib/matchApi';
import { claimView, proposedCase, vn } from '../testFixtures';

vi.mock('../../../lib/resultApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/resultApi')>()),
  confirmResultV2: vi.fn(), objectResultV2: vi.fn(), readResultPhoto: vi.fn(), readResultPhotos: vi.fn(),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const reload = vi.fn().mockResolvedValue(undefined);

it('P1 shows the proposal, why it is yellow and agrees with the case version', async () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'https://img.test/1.jpg' });
  vi.mocked(confirmResultV2).mockResolvedValue({ result: { status: 'acceptance_grace' } });
  render(<MatchResultPanel matchId="m1" resultCase={proposedCase({ version: 4 })} reload={reload} />);
  expect(screen.getByText('Đội A khai: Đội A thắng 2–1')).toBeInTheDocument();
  expect(screen.getByText('Người khai đã sửa số AI đọc')).toBeInTheDocument();
  expect(screen.getByText('đã sửa')).toBeInTheDocument();
  expect(screen.getByText('21–15')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Đồng ý kết quả' }));
  await waitFor(() => expect(confirmResultV2).toHaveBeenCalledWith('m1', 4));
});

it('Q2: a yellow proposal without public reasons shows the generic sentence and never mentions reputation', () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  const { container } = render(<MatchResultPanel matchId="m1" resultCase={proposedCase({ reasons: [], claims: [claimView({ reasons: [], editedCells: [] })] })} reload={reload} />);
  expect(screen.getByText('Đội kia có 6 giờ để kiểm tra.')).toBeInTheDocument();
  expect(container.textContent?.toLowerCase()).not.toContain('uy tín');
});

it('reloads and explains when the proposal was replaced before agreeing (RESULT_VERSION_STALE)', async () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  vi.mocked(confirmResultV2).mockRejectedValue(new MatchApiError('stale', 409, 'RESULT_VERSION_STALE'));
  render(<MatchResultPanel matchId="m1" resultCase={proposedCase()} reload={reload} />);
  fireEvent.click(screen.getByRole('button', { name: 'Đồng ý kết quả' }));
  expect(await screen.findByText('Bản khai vừa được gửi lại. Xem bản mới trước khi trả lời.')).toBeInTheDocument();
  expect(reload).toHaveBeenCalled();
});

it('P2 objects with a reason and opens photos when the server requires them', async () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  vi.mocked(objectResultV2).mockRejectedValueOnce(new MatchApiError('x', 400, 'RESULT_OBJECTION_EVIDENCE_REQUIRED'));
  render(<MatchResultPanel matchId="m1" resultCase={proposedCase({ version: 2 })} reload={reload} />);
  fireEvent.click(screen.getByRole('button', { name: 'Phản đối' }));
  fireEvent.click(screen.getByRole('radio', { name: /Trận không diễn ra/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Gửi phản đối' }));
  await waitFor(() => expect(objectResultV2).toHaveBeenCalledWith('m1', { reason: 'no_match', note: undefined, claimVersion: 2 }));
  expect(await screen.findByText('Bạn cần kèm ít nhất 1 ảnh khi phản đối.')).toBeInTheDocument();
  expect(screen.getByLabelText('Chọn ảnh bảng tỉ số')).toBeInTheDocument();
});

it('P3 doubles: tells the other loser who agreed and when it settles', () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  render(<MatchResultPanel matchId="m1" reload={reload} resultCase={proposedCase({
    status: 'acceptance_grace', graceDeadlineAt: vn('2026-10-22T21:40:00'),
    responses: [{ userId: 'b1', displayName: 'Lan Phương', kind: 'confirm', createdAt: vn('2026-10-22T20:40:00') }],
  })} />);
  expect(screen.getByText(/Lan Phương đã đồng ý lúc 20:40 22\/10/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Đồng ý luôn' })).toBeInTheDocument();
});

it('P3 paid partner: the payer is told the result only settles early with their agreement', () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  render(<MatchResultPanel matchId="m1" reload={reload} resultCase={proposedCase({
    pendingPayerUserId: 'a1', viewerSide: 'A',
    claims: [claimView({ claimantUserId: 'b1', side: 'B', outcome: 'TEAM_B_WIN', sets: [{ teamA: 15, teamB: 21 }, { teamA: 17, teamB: 21 }], editedCells: [] })],
    responses: [{ userId: 'a2', displayName: 'Minh Khôi', kind: 'confirm', createdAt: vn('2026-10-22T20:30:00') }],
  })} />);
  expect(screen.getByText(/Minh Khôi, người bạn trả phần, đã đồng ý/)).toBeInTheDocument();
});

it('P4 red: warns that the result will not settle on its own', () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  render(<MatchResultPanel matchId="m1" reload={reload} resultCase={proposedCase({ level: 'red', reasons: ['EXACT_DUPLICATE'], claims: [claimView({ level: 'red' })] })} />);
  expect(screen.getByText(/Kết quả có ảnh lạ không tự chốt/)).toBeInTheDocument();
  expect(screen.getByText('Ảnh trùng với ảnh của một trận khác')).toBeInTheDocument();
});

it('BO5: P1 shows every set of the proposal (mục 4)', () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'x' });
  const sets = [{ teamA: 21, teamB: 18 }, { teamA: 19, teamB: 21 }, { teamA: 21, teamB: 15 }, { teamA: 17, teamB: 21 }, { teamA: 21, teamB: 19 }];
  render(<MatchResultPanel matchId="m1" reload={reload} resultCase={proposedCase({ claims: [claimView({ sets, editedCells: [] })] })} />);
  expect(screen.getByText('Set 5')).toBeInTheDocument();
  expect(screen.getByText('Đội A khai: Đội A thắng 3–2')).toBeInTheDocument();
});
