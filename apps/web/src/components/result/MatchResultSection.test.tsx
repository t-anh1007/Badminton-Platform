import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MatchResultSection } from './MatchResultSection';
import { getResultCaseAny } from '../../lib/resultApi';
import { photoCase, proposedCase } from './testFixtures';

vi.mock('../../lib/resultApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/resultApi')>()),
  getResultCaseAny: vi.fn(),
}));
vi.mock('../MatchResultFlow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../MatchResultFlow')>()),
  MatchResultFlow: () => <p>Luồng kết quả cũ</p>,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('keeps the old result flow for legacy cases', async () => {
  vi.mocked(getResultCaseAny).mockResolvedValue({ ...photoCase(), rulesVersion: 'legacy' } as never);
  render(<MatchResultSection matchId="m1" />);
  expect(await screen.findByText('Luồng kết quả cũ')).toBeInTheDocument();
});

it('shows the photo-result panel with the progress rail for ra_v1 cases', async () => {
  vi.mocked(getResultCaseAny).mockResolvedValue(photoCase());
  render(<MatchResultSection matchId="m1" />);
  const rail = await screen.findByRole('complementary', { name: 'Tiến trình kết quả' });
  const current = within(rail).getAllByRole('listitem').find((item) => item.getAttribute('aria-current') === 'step')!;
  expect(current).toHaveTextContent('Khai kết quả');
  expect(current).toHaveTextContent('Hạn 08:00 23/10');
  expect(screen.queryByText('Luồng kết quả cũ')).not.toBeInTheDocument();
});

it('labels a response deadline moved past the night', async () => {
  vi.mocked(getResultCaseAny).mockResolvedValue(proposedCase());
  render(<MatchResultSection matchId="m1" />);
  const rail = await screen.findByRole('complementary', { name: 'Tiến trình kết quả' });
  expect(within(rail).getByText('Dời qua đêm từ 02:12')).toBeInTheDocument();
  expect(within(rail).getByText('Hạn 08:00 23/10')).toBeInTheDocument();
});

it('offers a retry when the case cannot be loaded', async () => {
  vi.mocked(getResultCaseAny).mockRejectedValue(new TypeError('fetch failed'));
  render(<MatchResultSection matchId="m1" />);
  expect(await screen.findByText('Chưa tải được kết quả trận')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
});

it('says the deadline just passed and waits for the server instead of changing state itself', async () => {
  vi.mocked(getResultCaseAny).mockResolvedValue(proposedCase({ serverNow: '2026-10-23T01:00:30Z', responseDeadlineAt: '2026-10-23T01:00:00Z', responseDeadlineBaseAt: '2026-10-23T01:00:00Z' }));
  render(<MatchResultSection matchId="m1" />);
  expect(await screen.findByText(/Đã hết hạn lúc 08:00 23\/10\. Hệ thống đang cập nhật/)).toBeInTheDocument();
});

it('wraps the block in the anchor used by result notifications', async () => {
  vi.mocked(getResultCaseAny).mockResolvedValue(photoCase());
  const { container } = render(<MatchResultSection matchId="m1" />);
  await screen.findByRole('complementary', { name: 'Tiến trình kết quả' });
  expect(container.querySelector('#ket-qua-tran')).not.toBeNull();
});
