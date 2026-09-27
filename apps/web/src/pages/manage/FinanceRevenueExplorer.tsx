import { Button, SelectInput } from '../../components/ui.js';
import { PeriodFilter, type Period } from '../../components/PeriodFilter.js';
import { MoneyBreakdown } from '../../components/MoneyBreakdown.js';
import { RevenueColumns, RevenueRanking } from '../../components/RevenueCharts.js';
import { refundedOf, type ProviderTransparencyResult } from '../../lib/financeApi.js';
import type { ManagedVenue } from '../../lib/venueBookingApi.js';

export type FinanceFilter = { venueId: string; period: Period };

/** Tổng quan tài chính chủ sân: bộ lọc chung, 2 khối phân rã và 2 biểu đồ; bấm vào đâu thì mở chi tiết tương ứng. */
export function FinanceRevenueExplorer({ data, venues, filters, onChange, onPickDay, onPickVenue, onShowPending }: {
  data: ProviderTransparencyResult; venues: ManagedVenue[]; filters: FinanceFilter; onChange: (filters: FinanceFilter) => void;
  onPickDay: (day: string) => void; onPickVenue: (venueId: string) => void; onShowPending: () => void;
}) {
  return <div className="grid gap-5">
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-canvas p-3">
      <label className="grid min-w-48 gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Cơ sở<SelectInput aria-label="Lọc cơ sở" value={filters.venueId} onChange={(event) => onChange({ ...filters, venueId: event.target.value })}><option value="">Tất cả cơ sở</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</SelectInput></label>
      <PeriodFilter value={filters.period} onChange={(period) => onChange({ ...filters, period })} />
      <p className="basis-full text-xs text-ink-500">Bộ lọc áp cho khối doanh thu, biểu đồ và phần Chi tiết dòng tiền bên dưới.</p>
    </div>
    <div className="grid gap-5 xl:grid-cols-2" aria-label="Phân loại dòng tiền">
      <MoneyBreakdown title="Doanh thu trong khoảng đang xem" totalLabel="Tổng khách đã trả" note="Theo cơ sở và kỳ xem đang chọn." parts={[
        { label: 'Chủ sân nhận', value: data.summary.net, color: 'bg-success' },
        { label: 'Phí nền tảng', value: data.summary.commission, color: 'bg-brand-navy' },
        { label: 'Đã hoàn lại khách', value: refundedOf(data.summary), color: 'bg-danger', detail: 'Booking bị hủy hoặc hoàn tiền' },
      ]} />
      <MoneyBreakdown title="Tiền của bạn hiện ở đâu" totalLabel="Tổng đã ghi nhận cho bạn" note="Số dư ví hiện tại, không phụ thuộc bộ lọc ngày." parts={[
        { label: 'Chờ đủ 24 giờ', value: data.summary.pending, color: 'bg-warning', detail: 'Chưa thể rút' },
        { label: 'Có thể rút', value: data.summary.available, color: 'bg-success', detail: 'Sẵn sàng tạo yêu cầu rút' },
        { label: 'Đang chuyển ngân hàng', value: data.summary.reserved, color: 'bg-brand-navy/40', detail: 'Đã giữ cho yêu cầu rút' },
        { label: 'Đã chuyển về ngân hàng', value: data.summary.withdrawn ?? '0', color: 'bg-brand-navy' },
      ]} footer={<Button size="sm" tone="secondary" onClick={onShowPending}>Xem các booking đang chờ đủ 24 giờ</Button>} />
    </div>
    {data.byDay ? <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr] xl:items-start">
      <RevenueColumns title="Doanh thu theo ngày" keyHeader="Ngày" points={data.byDay} labelOf={(key) => `${key.slice(8, 10)}/${key.slice(5, 7)}`} onPick={onPickDay} />
      <RevenueRanking title="Doanh thu theo cơ sở" keyHeader="Cơ sở" points={data.byVenue ?? []} labelOf={(key) => venues.find((venue) => venue.id === key)?.name ?? `Cơ sở #${key.slice(0, 8)}`} onPick={onPickVenue} />
    </div> : null}
  </div>;
}
