import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FinanceRevenueExplorer } from './manage/FinanceRevenueExplorer.js';
import { FinancePlatformOverview } from '../components/FinancePlatformOverview.js';
import type { AdminTransparencyResult, ProviderTransparencyResult } from '../lib/financeApi.js';

const providerData: ProviderTransparencyResult = {
  summary: { available: '180000', pending: '180000', reserved: '0', gross: '200000', net: '180000', commission: '20000' },
  transactions: { total: 21, page: 1, pageSize: 20, items: [{
    bookingId: '12345678-1234-1234-1234-123456789012', bookingCode: 'BK-00000042', venueId: 'venue-1', gross: '200000', net: '180000', commission: '20000',
    endAt: '2026-09-19T09:00:00Z', releaseAt: '2026-09-20T09:00:00Z', releasedAt: null, status: 'pending',
    payment: { method: 'sepay', provider: 'SePay', businessCode: 'GD-00000011', amount: '200000', providerReference: '928192', confirmedAt: '2026-09-19T07:42:00Z', reconciliationStatus: 'matched_auto', senderAccount: null, collectionAccount: null },
  }] },
};
afterEach(cleanup);

it('dùng ngôn ngữ nghiệp vụ cho chủ sân, màu phân cấp và Pagination chuẩn COURTIN', () => {
  const onChange = vi.fn();
  render(<FinanceRevenueExplorer data={providerData} venues={[{ id: 'venue-1', name: 'Sân Tân Bình' } as never]} filters={{ venueId: '', from: '19/09/2026', to: '19/09/2026', status: '', page: 1 }} onChange={onChange} />);
  expect(screen.getAllByText('180.000đ').some((element) => element.classList.contains('text-success'))).toBe(true);
  expect(screen.getByText('20.000đ')).toHaveClass('text-warning');
  expect(screen.queryByText(/ledger|wallet|database/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Booking BK-00000042'));
  expect(screen.getByRole('dialog', { name: 'Hành trình dòng tiền' })).toBeInTheDocument();
  expect(screen.queryByText('Thông tin hỗ trợ kiểm tra')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '›' }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
});

it('Admin có tổng quan đối soát bằng ngôn ngữ nghiệp vụ và phân trang', () => {
  const data: AdminTransparencyResult = {
    summary: { customerPayments: '128400000', ownerPending: '21780000', ownerAvailable: '74200000', reservedPayout: '15000000', paidPayout: '93600000', platformRevenue: '12320000', bankMovement: '128400000', allocatedMovement: '128400000', difference: '0' },
    transactions: { total: 21, page: 1, pageSize: 20, items: [{ id: 'event-1', businessCode: 'GD-00000012', direction: 'in', amount: '600000', provider: 'SePay', providerReference: '928192', receivedAt: '2026-09-19T07:42:00Z', status: 'matched_auto', businessReference: 'KLT12345678', matchedType: 'PaymentIntent', allocatedAmount: '600000' }] },
  };
  const onPageChange = vi.fn();
  render(<FinancePlatformOverview data={data} onPageChange={onPageChange} />);
  expect(screen.getByText('Chênh lệch cần xử lý')).toBeInTheDocument();
  expect(screen.getByText('Đã có đối ứng')).toBeInTheDocument();
  expect(screen.getByText('GD-00000012')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '›' }));
  expect(onPageChange).toHaveBeenCalledWith(2);
});
