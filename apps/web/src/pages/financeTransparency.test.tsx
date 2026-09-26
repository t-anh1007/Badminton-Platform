import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FinanceRevenueExplorer } from './manage/FinanceRevenueExplorer.js';
import { FinancePlatformOverview } from '../components/FinancePlatformOverview.js';
import { newPeriod, periodRange } from '../components/PeriodFilter.js';
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
  render(<FinanceRevenueExplorer data={providerData} venues={[{ id: 'venue-1', name: 'Sân Tân Bình' } as never]} filters={{ venueId: '', period: newPeriod('all'), status: '', page: 1 }} onChange={onChange} />);
  expect(screen.getAllByText('180.000đ').some((element) => element.classList.contains('text-success'))).toBe(true);
  expect(screen.getAllByText('20.000đ').some((element) => element.classList.contains('text-warning'))).toBe(true);
  expect(screen.getByRole('region', { name: 'Doanh thu trong khoảng đang xem' })).toBeInTheDocument();
  expect(screen.queryByText(/ledger|wallet|database/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Booking BK-00000042'));
  expect(screen.getByRole('dialog', { name: 'Hành trình dòng tiền' })).toBeInTheDocument();
  expect(screen.queryByText('Thông tin hỗ trợ kiểm tra')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '›' }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
});

it('booking đã hoàn tiền hiển thị đủ: khách trả = phí + đã hoàn + chủ sân nhận', () => {
  const row = { ...providerData.transactions.items[0], bookingCode: 'BK-00000099', gross: '60000', net: '0', commission: '0', status: 'cancelled' as const, releasedAt: null };
  render(<FinanceRevenueExplorer data={{ ...providerData, transactions: { ...providerData.transactions, items: [row] } }} venues={[]} filters={{ venueId: '', period: newPeriod('all'), status: '', page: 1 }} onChange={vi.fn()} />);
  expect(screen.getByRole('columnheader', { name: 'Đã hoàn' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Booking BK-00000099'));
  const dialog = screen.getByRole('dialog', { name: 'Hành trình dòng tiền' });
  expect(dialog).toHaveTextContent('60.000đ = 0đ phí nền tảng + 0đ tiền chủ sân + 60.000đ đã hoàn khách.');
  expect(dialog).toHaveTextContent('Hoàn 60.000đ cho khách');
  expect(dialog).not.toHaveTextContent('Chờ hết thời hạn xem xét');
});

it('Admin có tổng quan đối soát bằng ngôn ngữ nghiệp vụ và phân trang', () => {
  const data: AdminTransparencyResult = {
    summary: { customerPayments: '128400000', ownerPending: '21780000', ownerAvailable: '74200000', reservedPayout: '15000000', paidPayout: '93600000', platformRevenue: '12320000', bankMovement: '128400000', allocatedMovement: '128400000', difference: '0', bookingGross: '130000000', bookingRefunded: '1600000', bookingCommission: '12840000', bookingNet: '115560000', bankIn: '128400000', bankOut: '0' },
    transactions: { total: 21, page: 1, pageSize: 20, items: [{ id: 'event-1', businessCode: 'GD-00000012', direction: 'in', amount: '600000', provider: 'SePay', providerReference: '928192', receivedAt: '2026-09-19T07:42:00Z', status: 'matched_auto', businessReference: 'KLT12345678', matchedType: 'PaymentIntent', allocatedAmount: '600000' }] },
  };
  const onPickOwner = vi.fn();
  render(<FinancePlatformOverview data={{ ...data, byMonth: [], byOwner: [{ key: 'owner-1', gross: '200000', net: '180000', commission: '20000', refunded: '0', count: 2 }] }} ownerNames={new Map([['owner-1', 'Tuấn Anh']])} onPickOwner={onPickOwner} />);
  expect(screen.getByText('Chênh lệch cần xử lý')).toBeInTheDocument();
  expect(screen.getByText('Tiền vào ngân hàng')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Doanh thu đặt sân' })).toHaveTextContent('130.000.000đ');
  expect(screen.getByRole('region', { name: 'Tiền đang giữ trong hệ thống' })).toHaveTextContent('Người chơi · số dư ví');
  fireEvent.click(screen.getByRole('button', { name: 'Tuấn Anh' }));
  expect(onPickOwner).toHaveBeenCalledWith('owner-1');
});

it('biểu đồ doanh thu theo ngày và theo cơ sở giữ đúng phân rã khách trả = chủ sân + phí + đã hoàn', () => {
  const point = { gross: '260000', net: '180000', commission: '20000', refunded: '60000', count: 2 };
  render(<FinanceRevenueExplorer data={{ ...providerData, byDay: [{ key: '2026-09-19', ...point }], byVenue: [{ key: 'venue-1', ...point }] }} venues={[{ id: 'venue-1', name: 'Sân Tân Bình' } as never]} filters={{ venueId: '', period: newPeriod('all'), status: '', page: 1 }} onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: /19\/09: khách trả 260\.000đ = chủ sân 180\.000đ \+ phí 20\.000đ \+ đã hoàn 60\.000đ · 2 booking/ })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Doanh thu theo cơ sở' })).toHaveTextContent('Sân Tân Bình');
});

it('kỳ xem đổi thành khoảng ngày đúng: tháng lấy đủ ngày cuối, năm trọn năm, toàn bộ không giới hạn', () => {
  const base = newPeriod('all');
  expect(periodRange(base)).toEqual({});
  expect(periodRange({ ...base, mode: 'month', month: '2026-02' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  expect(periodRange({ ...base, mode: 'year', year: '2025' })).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  expect(periodRange({ ...base, mode: 'range', from: '', to: '2026-09-26' })).toEqual({ from: undefined, to: '2026-09-26' });
});

it('đổi bộ lọc trạng thái tự tải lại ngay, về trang 1', () => {
  const onChange = vi.fn();
  render(<FinanceRevenueExplorer data={providerData} venues={[]} filters={{ venueId: '', period: newPeriod('range'), status: '', page: 3 }} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Trạng thái dòng tiền'), { target: { value: 'pending' } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', page: 1 }));
});

it('Admin xem chi tiết dòng tiền: 9 tab, 5 dòng/trang, tên thay cho mã tài khoản, bút toán sổ cái', async () => {
  const api = await import('../lib/financeApi.js');
  const accounts = await import('../lib/accountApi.js');
  const ownerId = '9dbdbce2-0c1b-40ca-b1e3-74021e8f89c1';
  const row = { id: 'w1', title: 'WD123', titleNote: 'Tạo 12/09/2026 15:38', party: `@user:${ownerId}`, partyNote: 'Chủ sân', counterpart: 'TCB •••• 7018', counterpartNote: 'Khớp GD-00001102', status: 'Đã chi', tone: 'ok' as const, amount: '10000', sign: '-' as const, amountNote: 'yêu cầu 10.000đ', from: `Ví chủ sân · @user:${ownerId}`, fromNote: '', to: 'TCB •••• 7018', toNote: '', steps: [{ title: 'SePay xác nhận tiền ra', detail: 'GD-00001102', tone: 'ok' as const }], facts: [], refIds: ['w1'] };
  const flows = vi.spyOn(api, 'getAdminFinancialFlows').mockResolvedValue({ kpis: [{ label: 'Rút tiền đã chi', value: '10000', note: '1 yêu cầu', tone: 'ok' }], items: [row], total: 12, page: 1, pageSize: 5 });
  vi.spyOn(api, 'getAdminFlowLedger').mockResolvedValue([{ id: 'l1', walletType: 'business', userId: ownerId, type: 'payout', refType: 'withdrawal', amount: '-10000', ts: '2026-09-12T08:38:00Z' }]);
  vi.spyOn(accounts, 'getAdminAccountIdentities').mockResolvedValue([{ id: ownerId, email: 'owner@demo.vn', displayName: 'Tuấn Anh', businessCode: 'TK-1' }]);
  const { AdminFinanceFlows } = await import('../components/AdminFinanceFlows.js');
  vi.spyOn(accounts, 'getAdminAccounts').mockResolvedValue([{ id: ownerId, email: 'owner@demo.vn', displayName: 'Tuấn Anh', status: 'active', roles: ['provider'] } as never]);
  render(<AdminFinanceFlows nav={{ tab: 'withdraw', nonce: 0 }} owners={[]} />);
  expect(await screen.findAllByText('Tuấn Anh')).not.toHaveLength(0);
  expect(flows).toHaveBeenCalledWith(expect.objectContaining({ tab: 'withdraw', filter: 'paid', page: 1, pageSize: 5 }));
  expect(screen.getAllByRole('button', { pressed: undefined }).length).toBeGreaterThan(0);
  expect(await screen.findByText('chuyển về ngân hàng', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('Hiển thị 1–5 / 12 dòng')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Tìm trong chi tiết dòng tiền'), { target: { value: 'Tuấn Anh' } });
  await waitFor(() => expect(flows).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Tuấn Anh', userIds: ownerId, page: 1 })), { timeout: 2000 });
  fireEvent.change(screen.getByLabelText('Kỳ xem'), { target: { value: 'year' } });
  await waitFor(() => expect(flows).toHaveBeenLastCalledWith(expect.objectContaining({ from: expect.stringMatching(/-01-01T00:00:00/), to: expect.stringMatching(/-12-31T23:59:59/) })));
  fireEvent.click(screen.getByRole('button', { name: 'Kèo' }));
  await waitFor(() => expect(flows).toHaveBeenLastCalledWith(expect.objectContaining({ tab: 'match', filter: '', page: 1 })));
  expect(screen.getAllByRole('button', { name: /Doanh thu đặt sân|Phí nền tảng|Hoàn tiền|Nạp ví|Kèo|Rút tiền|Thưởng giải|Số dư ví|Giao dịch ngân hàng/ }).length).toBeGreaterThanOrEqual(9);
});
