import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ManageBookingsPage } from './ManageBookingsPage.js';
import { getProviderBookings } from '../../lib/venueBookingApi.js';

vi.mock('../../lib/venueBookingApi.js', () => ({
  getMyManagedVenues: vi.fn().mockResolvedValue([{
    id: 'v1',
    name: 'CLB Linh Xuân',
    courts: [{ id: 'c1', name: 'Sân 02' }],
  }]),
  getProviderBookings: vi.fn().mockResolvedValue({
    items: [{
      id: '11111111-1111-4111-8111-111111111111',
      businessCode: 'BK-00001234',
      source: 'marketplace',
      status: 'confirmed',
      startAt: '2026-09-22T11:00:00.000Z',
      endAt: '2026-09-22T13:00:00.000Z',
      priceSnapshot: '240000',
      holdExpiresAt: null,
      cancellationReason: null,
      matchDepositPaid: false,
      manualCustomerNotificationRequired: false,
      customer: { label: 'Nguyễn Minh Anh' },
      court: {
        id: 'c1',
        name: 'Sân 02',
        venue: { id: 'v1', name: 'CLB Linh Xuân', address: 'Thủ Đức' },
      },
    }],
    total: 1,
    page: 1,
    pageSize: 20,
    summary: { all: 128, completed: 96, current: 3, future: 29 },
  }),
  getProviderBookingDetail: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ManageBookingsPage', () => {
  it('shows the provider follow-up only for a shutdown-cancelled internal booking', async () => {
    vi.mocked(getProviderBookings).mockResolvedValueOnce({
      items: [{
        id: '22222222-2222-4222-8222-222222222222', businessCode: 'BK-00001235', source: 'internal', status: 'cancelled',
        startAt: '2026-09-22T11:00:00.000Z', endAt: '2026-09-22T13:00:00.000Z', priceSnapshot: '240000',
        holdExpiresAt: null, cancellationReason: 'provider_fault', matchDepositPaid: false,
        manualCustomerNotificationRequired: true, customer: { label: 'Khách tại quầy' },
        court: { id: 'c1', name: 'Sân 02', venue: { id: 'v1', name: 'CLB Linh Xuân', address: 'Thủ Đức' } },
      }], total: 1, page: 1, pageSize: 20, summary: { all: 1, completed: 0, current: 0, future: 0 },
    });
    render(<MemoryRouter initialEntries={['/manage/bookings']}><ManageBookingsPage /></MemoryRouter>);

    expect(await screen.findByText('Bạn cần tự thông báo cho khách')).toBeVisible();
  });

  it('renders summary, provider-owned rows, and writes filters to the request', async () => {
    render(
      <MemoryRouter initialEntries={['/manage/bookings']}>
        <ManageBookingsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Quản lý booking' })).toBeVisible();
    expect(screen.getByText('128')).toBeVisible();
    expect(screen.getAllByText('Nguyễn Minh Anh')[0]).toBeVisible();
    expect(screen.getAllByText('240.000đ')[0]).toBeVisible();

    fireEvent.change(screen.getByLabelText('Cơ sở'), { target: { value: 'v1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sắp tới' }));

    await waitFor(() => expect(getProviderBookings).toHaveBeenLastCalledWith(expect.objectContaining({
      venueId: 'v1',
      timeScope: 'future',
      page: 1,
    })));
  });

  it('shows a recoverable list error', async () => {
    vi.mocked(getProviderBookings).mockRejectedValueOnce(new Error('Không thể tải booking.'));
    render(
      <MemoryRouter>
        <ManageBookingsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải booking.');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  });

  it('opens a query-addressable drawer and hides marketplace contact data', async () => {
    const api = await import('../../lib/venueBookingApi.js');
    vi.mocked(api.getProviderBookingDetail).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      businessCode: 'BK-00001234',
      source: 'marketplace',
      status: 'confirmed',
      startAt: '2026-09-22T11:00:00.000Z',
      endAt: '2026-09-22T13:00:00.000Z',
      priceSnapshot: '240000',
      holdExpiresAt: null,
      cancellationReason: null,
      matchDepositPaid: false,
      manualCustomerNotificationRequired: false,
      customer: { label: 'Nguyễn Minh Anh' },
      court: {
        id: 'c1',
        name: 'Sân 02',
        venue: { id: 'v1', name: 'CLB Linh Xuân', address: 'Thủ Đức' },
      },
      cancellationRefundPercent: null,
      courtChangedAt: null,
    });
    render(
      <MemoryRouter initialEntries={['/manage/bookings']}>
        <ManageBookingsPage />
      </MemoryRouter>,
    );

    fireEvent.click((await screen.findAllByRole('button', { name: /Xem chi tiết booking/i }))[0]);
    expect(await screen.findByRole('dialog', { name: 'Chi tiết booking' })).toBeVisible();
    expect(screen.getByText('CLB Linh Xuân · Sân 02')).toBeVisible();
    expect(screen.queryByText(/090/)).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows guest contact only for an internal booking and retries detail errors', async () => {
    const api = await import('../../lib/venueBookingApi.js');
    vi.mocked(api.getProviderBookingDetail)
      .mockRejectedValueOnce(new Error('Không thể tải chi tiết.'))
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        businessCode: 'BK-00001234',
        source: 'internal',
        status: 'confirmed',
        startAt: '2026-09-22T11:00:00.000Z',
        endAt: '2026-09-22T13:00:00.000Z',
        priceSnapshot: '240000',
        holdExpiresAt: null,
        cancellationReason: null,
        matchDepositPaid: false,
        manualCustomerNotificationRequired: false,
        customer: { label: 'Khách tại quầy', guestContact: '0900000000' },
        court: {
          id: 'c1',
          name: 'Sân 02',
          venue: { id: 'v1', name: 'CLB Linh Xuân', address: 'Thủ Đức' },
        },
        cancellationRefundPercent: null,
        courtChangedAt: null,
      });
    render(
      <MemoryRouter initialEntries={['/manage/bookings?booking=11111111-1111-4111-8111-111111111111']}>
        <ManageBookingsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải chi tiết.');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại chi tiết' }));
    expect(await screen.findByText('0900000000')).toBeVisible();
  });
});
