import { FinanceFlows, type FlowNavState, type FlowPlace, type FlowSync, type FlowTabConfig } from '../../components/FinanceFlows.js';
import type { Period } from '../../components/PeriodFilter.js';
import { getMyFinancialFlows, getMyFlowLedger, type ProviderFlowTab } from '../../lib/financeApi.js';

const TABS: Array<FlowTabConfig<ProviderFlowTab>> = [
  { key: 'revenue', label: 'Doanh thu booking', forCards: 'Doanh thu trong khoảng đang xem · Chờ đủ 24 giờ · Có thể rút · Biểu đồ theo ngày và theo cơ sở', cols: ['Booking / sân', 'Khách đặt', 'Mở khóa', 'Trạng thái', 'Khách trả'], chips: [['', 'Tất cả'], ['pending', 'Chờ 24 giờ'], ['available', 'Có thể rút'], ['cancelled', 'Đã hủy'], ['dispute', 'Có tranh chấp']], searchHint: 'Mã booking BK-…, tên khách, tên sân' },
  { key: 'deduct', label: 'Hoàn tiền và khoản bị trừ', forCards: 'Doanh thu trong khoảng đang xem › Đã hoàn lại khách', cols: ['Booking', 'Khách nhận hoàn', 'Lý do', 'Loại', 'Bạn bị trừ'], chips: [['', 'Tất cả'], ['customer', 'Khách hủy'], ['venue', 'Lỗi phía sân'], ['dispute', 'Tranh chấp']], searchHint: 'Mã booking BK-…, mã tranh chấp KN-…, tên khách' },
  { key: 'withdraw', label: 'Rút tiền', forCards: 'Tiền của bạn hiện ở đâu › Đang chuyển ngân hàng · Đã chuyển về ngân hàng', cols: ['Mã yêu cầu', 'Tài khoản nhận', 'Ngân hàng xác nhận', 'Trạng thái', 'Số tiền'], chips: [['', 'Tất cả'], ['pending', 'Đang xử lý'], ['paid', 'Đã chuyển'], ['rejected', 'Bị từ chối']], searchHint: 'Mã yêu cầu rút' },
  { key: 'ledger', label: 'Sổ ví', forCards: 'Số dư có thể rút · Tiền của bạn hiện ở đâu (mọi lần số dư thay đổi)', cols: ['Nội dung', 'Liên quan', 'Số dư có thể rút sau', 'Khoản', 'Thay đổi'], chips: [['', 'Tất cả'], ['in', 'Tiền vào'], ['out', 'Tiền ra']], searchHint: 'Mã booking BK-…, mã yêu cầu rút, nội dung' },
  { key: 'venues', label: 'Theo cơ sở / sân', forCards: 'Biểu đồ "Doanh thu theo cơ sở" · chia xuống từng sân con', cols: ['Cơ sở / sân', 'Booking', 'Phí', 'Hoàn', 'Bạn nhận'], chips: [['venue', 'Theo cơ sở'], ['court', 'Theo sân con']], searchHint: 'Tên cơ sở hoặc sân' },
];

/** Chi tiết dòng tiền của chủ sân: 5 tab, có kỳ xem + cơ sở/sân con riêng; trang cha đẩy bộ lọc vào qua sync. */
export function ProviderFinanceFlows({ nav, venues, sync, initialPeriod, version = 0 }: {
  nav: FlowNavState<ProviderFlowTab>; venues: FlowPlace[]; sync?: FlowSync; initialPeriod?: Period;
  /** Tăng khi số dư thay đổi (rút tiền, realtime) để tải lại danh sách. */ version?: number;
}) {
  return <FinanceFlows
    tabs={TABS} nav={nav} reloadKey={String(version)} places={venues} placeTabs={['revenue', 'deduct', 'venues']} sync={sync} initialPeriod={initialPeriod}
    load={getMyFinancialFlows}
    loadLedger={getMyFlowLedger}
    walletName={() => 'Ví của bạn'}
  />;
}
