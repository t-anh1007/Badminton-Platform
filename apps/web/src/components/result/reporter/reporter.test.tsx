import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MatchResultPanel } from '../MatchResultPanel';
import { readResultPhotos, readResultPhoto, submitResultClaimV2, type ResultDraftResponse } from '../../../lib/resultApi';
import { MatchApiError } from '../../../lib/matchApi';
import { claimView, photoCase, vn } from '../testFixtures';

vi.mock('../../../lib/resultApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/resultApi')>()),
  readResultPhotos: vi.fn(), submitResultClaimV2: vi.fn(), readResultPhoto: vi.fn(),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const reload = vi.fn().mockResolvedValue(undefined);
const jpeg = (name = 'a.jpg', size = 10) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' });
const pick = (files: File[]) => fireEvent.change(screen.getByLabelText('Chọn ảnh bảng tỉ số'), { target: { files } });

const flipDraft = (patch: Partial<ResultDraftResponse['draft']> = {}): ResultDraftResponse => ({
  draftId: 'd1',
  draft: {
    format: 'bo3', columnMappedBy: null, level: 'yellow', reasons: ['USER_COLUMN_MAPPING', 'LOW_CELL_CONFIDENCE'], manualEntry: false,
    sets: [
      { teamA: 21, teamB: 18, sourceUploadId: 'u1', lowConfidence: false },
      { teamA: 19, teamB: 21, sourceUploadId: 'u1', lowConfidence: true },
      { teamA: 21, teamB: 15, sourceUploadId: 'u2', lowConfidence: false },
    ],
    ...patch,
  },
  images: [{ uploadId: 'u1', read: true, flags: [] }, { uploadId: 'u2', read: true, flags: [] }],
  columns: { left: null, right: null }, viewerQuota: { photosUsed: 0, photosLimit: 7, draftsLeft: 13 },
});

it('K1 rejects photos of the wrong type or over 15 MB before uploading', async () => {
  render(<MatchResultPanel matchId="m1" resultCase={photoCase()} reload={reload} />);
  pick([new File(['x'], 'a.heic', { type: 'image/heic' })]);
  expect(await screen.findByText('Chỉ nhận ảnh JPG, PNG, WEBP.')).toBeInTheDocument();
  pick([jpeg('big.jpg', 15 * 1024 * 1024 + 1)]);
  expect(await screen.findByText('Mỗi ảnh tối đa 15 MB.')).toBeInTheDocument();
  expect(readResultPhotos).not.toHaveBeenCalled();
});

it('K1 respects the remaining photo quota', async () => {
  render(<MatchResultPanel matchId="m1" resultCase={photoCase({ viewerQuota: { photosUsed: 6, photosLimit: 7, draftsLeft: 9 } })} reload={reload} />);
  pick([jpeg('a.jpg'), jpeg('b.jpg')]);
  expect(await screen.findByText('Bạn còn chọn được tối đa 1 ảnh.')).toBeInTheDocument();
});

it('K3 asks which team the left column is, marks the unsure set, keeps the AI number of an edited cell and sends edits', async () => {
  vi.mocked(readResultPhotos).mockResolvedValue(flipDraft());
  vi.mocked(submitResultClaimV2).mockResolvedValue({ claim: {} });
  render(<MatchResultPanel matchId="m1" resultCase={photoCase()} reload={reload} />);
  pick([jpeg('a.jpg'), jpeg('b.jpg')]);
  expect(await screen.findByText('Cột trái trên ảnh là đội nào?')).toBeInTheDocument();
  expect(screen.getByText('AI chưa chắc')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Gửi kết quả' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: /^Đội A/ }));
  fireEvent.change(screen.getByLabelText('Set 3 Đội B'), { target: { value: '16' } });
  expect(screen.getByText('AI 15')).toBeInTheDocument();
  expect(screen.getByText('Dự kiến: Vàng')).toBeInTheDocument();
  expect(screen.getByText('Người khai đã sửa số AI đọc')).toBeInTheDocument();
  expect(screen.getByText('Đội A thắng 2–1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Gửi kết quả' }));
  await waitFor(() => expect(submitResultClaimV2).toHaveBeenCalledWith('m1', {
    draftId: 'd1', columnMapping: 'left_is_A', editedCells: [{ set: 2, side: 'B' }],
    sets: [{ teamA: 21, teamB: 18 }, { teamA: 19, teamB: 21 }, { teamA: 21, teamB: 16 }],
  }));
  expect(reload).toHaveBeenCalled();
});

it('K3 swaps the numbers when the left column is team B', async () => {
  vi.mocked(readResultPhotos).mockResolvedValue(flipDraft());
  render(<MatchResultPanel matchId="m1" resultCase={photoCase()} reload={reload} />);
  pick([jpeg()]);
  fireEvent.click(await screen.findByRole('radio', { name: /^Đội B/ }));
  expect(screen.getByLabelText('Set 1 Đội A')).toHaveValue('18');
  expect(screen.getByText('Đội B thắng 2–1')).toBeInTheDocument();
});

it('K4 lets the reporter type scores when AI could not read, and blocks scores that break the rules', async () => {
  vi.mocked(readResultPhotos).mockResolvedValue(flipDraft({ manualEntry: true, sets: [], reasons: ['AI_UNAVAILABLE'] }));
  vi.mocked(submitResultClaimV2).mockRejectedValue(new MatchApiError('x', 400, 'RESULT_SCORE_INVALID'));
  render(<MatchResultPanel matchId="m1" resultCase={photoCase()} reload={reload} />);
  pick([jpeg()]);
  expect(await screen.findByText(/Chưa đọc được ảnh/)).toBeInTheDocument();
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  type('Set 1 Đội A', '21'); type('Set 1 Đội B', '18'); type('Set 2 Đội A', '25'); type('Set 2 Đội B', '10');
  expect(screen.getByText(/Tỉ số chưa hợp lệ theo luật/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Gửi kết quả' })).toBeDisabled();
  type('Set 2 Đội A', '15'); type('Set 2 Đội B', '21');
  expect(screen.getByText('Dự kiến: Vàng')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Gửi kết quả' }));
  expect(await screen.findByText('Tỉ số chưa hợp lệ theo luật. Kiểm tra lại từng set.')).toBeInTheDocument();
});

it('K5 shows the sent result with the moved deadline and lets the reporter replace it', async () => {
  vi.mocked(readResultPhoto).mockResolvedValue({ url: 'https://img.test/1.jpg' });
  const sent = photoCase({
    status: 'proposed', level: 'yellow', reasons: ['EDITED_CELL'], proposalClaimId: 'c1', claims: [claimView()],
    responseDeadlineBaseAt: vn('2026-10-23T02:12:00'), responseDeadlineAt: vn('2026-10-23T08:00:00'),
    viewerActions: { ...photoCase().viewerActions, canClaim: false, canReplace: true },
  });
  render(<MatchResultPanel matchId="m1" resultCase={sent} reload={reload} />);
  expect(screen.getByText('Đã gửi: Đội A thắng 2–1')).toBeInTheDocument();
  expect(screen.getAllByText('Dời qua đêm từ 02:12').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Thay bản khai' }));
  expect(screen.getByLabelText('Chọn ảnh bảng tỉ số')).toBeInTheDocument();
});

it('K1 says automatic photo reading is off and scores are typed by hand (mục 2)', () => {
  render(<MatchResultPanel matchId="m1" resultCase={photoCase({ photoReadingEnabled: false })} reload={reload} />);
  expect(screen.getByText(/Đọc ảnh tự động đang tạm tắt, bạn nhập tỉ số tay/)).toBeInTheDocument();
  expect(screen.queryByText(/AI đọc ảnh và điền sẵn/)).not.toBeInTheDocument();
});

it('BO5: K3 shows five set rows and sends a 3–2 result (mục 4)', async () => {
  const five = [[21, 18], [19, 21], [21, 15], [17, 21], [21, 19]] as const;
  vi.mocked(readResultPhotos).mockResolvedValue({
    ...flipDraft(), draft: { ...flipDraft().draft, format: 'bo5', columnMappedBy: 'ai', level: 'green', reasons: [],
      sets: five.map(([teamA, teamB]) => ({ teamA, teamB, sourceUploadId: 'u1', lowConfidence: false })) },
  });
  vi.mocked(submitResultClaimV2).mockResolvedValue({ claim: {} });
  const bo5 = photoCase();
  render(<MatchResultPanel matchId="m1" resultCase={{ ...bo5, match: { ...bo5.match, format: 'bo5' } }} reload={reload} />);
  pick([jpeg()]);
  expect(await screen.findByLabelText('Set 5 Đội A')).toHaveValue('21');
  expect(screen.getByText('Đội A thắng 3–2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Gửi kết quả' }));
  await waitFor(() => expect(submitResultClaimV2).toHaveBeenCalledWith('m1', expect.objectContaining({ sets: five.map(([teamA, teamB]) => ({ teamA, teamB })) })));
});

it('BO5: K4 typing by hand offers five rows', async () => {
  vi.mocked(readResultPhotos).mockResolvedValue(flipDraft({ format: 'bo5', manualEntry: true, sets: [], reasons: ['AI_UNAVAILABLE'] }));
  const bo5 = photoCase();
  render(<MatchResultPanel matchId="m1" resultCase={{ ...bo5, match: { ...bo5.match, format: 'bo5' } }} reload={reload} />);
  pick([jpeg()]);
  expect(await screen.findByLabelText('Set 5 Đội B')).toBeInTheDocument();
  expect(screen.queryByLabelText('Set 6 Đội B')).not.toBeInTheDocument();
});
