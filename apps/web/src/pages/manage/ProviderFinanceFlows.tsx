import { FinanceFlows, type FlowNavState, type FlowTabConfig } from '../../components/FinanceFlows.js';
import { getMyFinancialFlows, getMyFlowLedger, type ProviderFlowTab } from '../../lib/financeApi.js';

const TABS: Array<FlowTabConfig<ProviderFlowTab>> = [
  { key: 'revenue', label: 'Doanh thu booking', forCards: 'Doanh thu trong khoảng đang xem · Chờ đủ 24 giờ · Có thể rút · Biểu đồ theo ngày và theo cơ sở', cols: ['Booking / sân', 'Khách đặt', 'Mở khóa', 'Trạng thái', 'Khách trả'], chips: [['', 'Tất cả'], ['pending', 'Chờ 24 giờ'], ['available', 'Có thể rút'], ['cancelled', 'Đã hủy'], ['dispute', 'Có tranh chấp']], searchHint: 'Mã booking BK-…, tên khách, tên sân' },
  { key: 'deduct', label: 'Hoàn tiền và khoản bị trừ', forCards: 'Doanh thu trong khoảng đang xem › Đã hoàn lại khách', cols: ['Booking', 'Khách nhận hoàn', 'Lý do', 'Loại', 'Bạn bị trừ'], chips: [['', 'Tất cả'], ['customer', 'Khách hủy'], ['venue', 'Lỗi phía sân'], ['dispute', 'Tranh chấp']], searchHint: 'Mã booking BK-…, mã tranh chấp KN-…, tên khách' },
  { key: 'withdraw', label: 'Rút tiền', forCards: 'Tiền của bạn hiện ở đâu › Đang chuyển ngân hàng · Đã chuyển về ngân hàng', cols: ['Mã yêu cầu', 'Tài khoản nhận', 'Ngân hàng xác nhận', 'Trạng thái', 'Số tiền'], chips: [['', 'Tất cả'], ['pending', 'Đang xử lý'], ['paid', 'Đã chuyển'], ['rejected', 'Bị từ chối']], searchHint: 'Mã yêu cầu rút' },
  { key: 'ledger', label: 'Sổ ví', forCards: 'Số dư có thể rút · Tiền của bạn hiện ở đâu (mọi lần số dư thay đổi)', cols: ['Nội dung', 'Liên quan', 'Số dư có thể rút sau', 'Khoản', 'Thay đổi'], chips: [['', 'Tất cả'], ['in', 'Tiền vào'], ['out', 'Tiền ra']], searchHint: 'Mã booking BK-…, mã yêu cầu rút, nội dung' },
  { key: 'venues', label: 'Theo cơ sở / sân', forCards: 'Biểu đồ "Doanh thu theo cơ sở" · chia xuống từng sân con', cols: ['Cơ sở / sân', 'Booking', 'Phí', 'Hoàn', 'Bạn nhận'], chips: [['venue', 'Theo cơ sở'], ['court', 'Theo sân con']], searchHint: 'Tên cơ sở hoặc sân' },
];

/** Chi tiết dòng tiền của chủ sân: 5 tab, dùng bộ lọc cơ sở + kỳ xem của trang; ngày bấm trên biểu đồ lọc chồng lên. */
export function ProviderFinanceFlows({ nav, venueId, range, day, onClearDay, version = 0 }: {
  nav: FlowNavState<ProviderFlowTab>; venueId: string; range: { from?: string; to?: string }; day?: string; onClearDay: () => void;
  /** Tăng khi số dư thay đổi (rút tiền, realtime) để tải lại danh sách. */ version?: number;
}) {
  const effective = day ? { from: `${day}T00:00:00.000+07:00`, to: `${day}T23:59:59.999+07:00` } : range;
  return <FinanceFlows
    tabs={TABS} nav={nav} range={effective} reloadKey={`${venueId}:${version}`}
    load={(query) => getMyFinancialFlows({ ...query, venueId: venueId || undefined })}
    loadLedger={getMyFlowLedger}
    walletName={() => 'Ví của bạn'}
    toolbar={() => day ? <span className="ml-auto flex items-center gap-2 text-xs"><span className="rounded-full bg-info-bg px-3 py-1.5 font-bold text-brand-navy">Đang lọc từ biểu đồ: ngày {day.slice(8, 10)}/{day.slice(5, 7)}/{day.slice(0, 4)}</span><button type="button" onClick={onClearDay} className="min-h-9 rounded-full border border-line px-3 font-bold text-ink-700 hover:border-brand-navy">Bỏ lọc ×</button></span> : null}
  />;
}
