import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { confirmOperationalShutdown, previewOperationalShutdown } from '../../lib/venueBookingApi.js';
import { OperationalShutdownDialog } from './OperationalShutdownDialog.js';

vi.mock('../../lib/venueBookingApi.js', () => ({
  previewOperationalShutdown: vi.fn(),
  confirmOperationalShutdown: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('shows all three approved choices, previews affected bookings and requires explicit confirmation', async () => {
  vi.mocked(previewOperationalShutdown).mockResolvedValue({
    affectedMarketplace: 2, affectedMatch: 1, affectedInternal: 1,
    activeCheckoutHolds: 1, activeMatchHolds: 1, existingConfirmedBookings: 8,
    continuingBookings: 4, closeAt: '2026-09-26T00:00:00.000Z',
    estimatedRefund: '360000', estimatedRefundExcludesUnsettledMatches: false,
    expectedInactiveAt: '2026-09-25T17:00:00Z', effectiveAt: '2026-09-25T17:00:00Z',
    previewToken: 'a'.repeat(64),
  });
  vi.mocked(confirmOperationalShutdown).mockResolvedValue({} as never);
  const onDone = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<OperationalShutdownDialog target={{ scope: 'venue', id: 'v1', label: 'CLB Linh Xuân' }} current={null} onClose={onClose} onDone={onDone} />);

  expect(screen.getByRole('radio', { name: /Ngừng nhận lịch đặt mới/ })).toBeVisible();
  expect(screen.getByRole('radio', { name: /Đóng cửa từ ngày đã chọn/ })).toBeVisible();
  expect(screen.getByRole('radio', { name: /Ngừng hoạt động ngay do sự cố/ })).toBeVisible();
  fireEvent.click(screen.getByRole('radio', { name: /Đóng cửa từ ngày đã chọn/ }));
  fireEvent.change(screen.getByLabelText('Ngày bắt đầu đóng cửa'), { target: { value: '2026-09-26' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh hưởng' }));
  await waitFor(() => expect(previewOperationalShutdown).toHaveBeenCalledWith('venue', 'v1', { mode: 'scheduled_close', closeDate: '2026-09-26' }));
  expect(await screen.findByText('Lịch bị hủy')).toBeVisible();
  expect(screen.getByText('Lịch bị hủy').parentElement).toHaveTextContent('4');
  expect(screen.getByText(/4 lịch tiếp tục phục vụ/)).toBeVisible();
  expect(screen.getByText('Dự kiến hoàn cho khách').parentElement).toHaveTextContent('360.000đ');
  expect(screen.queryByText(/chưa gồm các khoản đóng góp/)).not.toBeInTheDocument();
  expect(screen.getByText(/Qua COURTIN: 2/)).toBeVisible();
  const confirm = screen.getByRole('button', { name: 'Đóng cửa sân' });
  expect(confirm).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(confirm);
  await waitFor(() => expect(confirmOperationalShutdown).toHaveBeenCalledWith('venue', 'v1', { mode: 'scheduled_close', closeDate: '2026-09-26' }, 'a'.repeat(64)));
  expect(onDone).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});
