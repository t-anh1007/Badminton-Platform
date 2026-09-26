import { useState } from 'react';
import { Badge, Button, EmptyState, Pagination, SelectInput } from '../../components/ui.js';
import { newPeriod, PeriodFilter, type Period } from '../../components/PeriodFilter.js';
import { FinanceTraceDrawer } from '../../components/FinanceTraceDrawer.js';
import { MoneyBreakdown } from '../../components/MoneyBreakdown.js';
import { RevenueColumns, RevenueRanking } from '../../components/RevenueCharts.js';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import { refundedOf, type ProviderTransparencyResult, type ProviderTransparencyRow } from '../../lib/financeApi.js';
import type { ManagedVenue } from '../../lib/venueBookingApi.js';

export type FinanceFilter = { venueId: string; period: Period; status: string; page: number };
type Filter = FinanceFilter;
const statusCopy = {
  pending: ['Chờ đủ 24 giờ', 'warning'], available: ['Có thể rút', 'success'],
  disputed: ['Đang xem xét', 'danger'], cancelled: ['Đã hủy', 'neutral'],
} as const;

export function FinanceRevenueExplorer({ data, venues, filters, onChange }: {
  data: ProviderTransparencyResult; venues: ManagedVenue[]; filters: Filter; onChange: (filters: Filter) => void;
}) {
  const [form, setForm] = useState(filters);
  // Đổi bộ lọc nào cũng tải lại ngay; nút Áp dụng vẫn giữ để tải lại thủ công.
  const change = (patch: Partial<Filter>) => { const next = { ...form, ...patch, page: 1 }; setForm(next); onChange(next); };
  const [selected, setSelected] = useState<ProviderTransparencyRow | null>(null);
  const pageCount = Math.max(1, Math.ceil(data.transactions.total / data.transactions.pageSize));
  return <div className="grid gap-5">
    <div className="grid gap-5 xl:grid-cols-2" aria-label="Phân loại dòng tiền">
      <MoneyBreakdown title="Doanh thu trong khoảng đang xem" totalLabel="Tổng khách đã trả" note="Theo cơ sở, kỳ xem và trạng thái đang lọc bên dưới." parts={[
        { label: 'Chủ sân nhận', value: data.summary.net, color: 'bg-success' },
        { label: 'Phí nền tảng', value: data.summary.commission, color: 'bg-brand-navy' },
        { label: 'Đã hoàn lại khách', value: refundedOf(data.summary), color: 'bg-danger', detail: 'Booking bị hủy hoặc hoàn tiền' },
      ]} />
      <MoneyBreakdown title="Tiền của bạn hiện ở đâu" totalLabel="Tổng đã ghi nhận cho bạn" note="Số dư ví hiện tại, không phụ thuộc bộ lọc ngày." parts={[
        { label: 'Chờ đủ 24 giờ', value: data.summary.pending, color: 'bg-warning', detail: 'Chưa thể rút' },
        { label: 'Có thể rút', value: data.summary.available, color: 'bg-success', detail: 'Sẵn sàng tạo yêu cầu rút' },
        { label: 'Đang chuyển ngân hàng', value: data.summary.reserved, color: 'bg-brand-navy/40', detail: 'Đã giữ cho yêu cầu rút' },
        { label: 'Đã chuyển về ngân hàng', value: data.summary.withdrawn ?? '0', color: 'bg-brand-navy' },
      ]} footer={<Button size="sm" tone="secondary" onClick={() => { change({ period: newPeriod('all'), status: 'pending' }); document.getElementById('finance-booking-detail')?.scrollIntoView({ behavior: 'smooth' }); }}>Xem các booking đang chờ đủ 24 giờ</Button>} />
    </div>
    {data.byDay ? <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr] xl:items-start">
      <RevenueColumns title="Doanh thu theo ngày" keyHeader="Ngày" points={data.byDay} labelOf={(key) => `${key.slice(8, 10)}/${key.slice(5, 7)}`} />
      <RevenueRanking title="Doanh thu theo cơ sở" keyHeader="Cơ sở" points={data.byVenue ?? []} labelOf={(key) => venues.find((venue) => venue.id === key)?.name ?? `Cơ sở #${key.slice(0, 8)}`} />
    </div> : null}
    <section id="finance-booking-detail" className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-end gap-2"><div className="mr-auto"><h3 className="text-h3">Chi tiết từng booking</h3><p className="mt-1 text-sm text-ink-500">Mỗi hàng: tiền khách trả = phí nền tảng + tiền đã hoàn khách + phần chủ sân nhận.</p></div></div>
      <form className="mb-3 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-canvas p-3" onSubmit={(event) => { event.preventDefault(); onChange({ ...form, page: 1 }); }}>
        <label className="grid min-w-48 flex-1 gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Cơ sở<SelectInput aria-label="Lọc cơ sở" value={form.venueId} onChange={(event) => change({ venueId: event.target.value })}><option value="">Tất cả cơ sở</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</SelectInput></label>
        <PeriodFilter value={form.period} onChange={(period) => change({ period })} />
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Trạng thái<SelectInput aria-label="Trạng thái dòng tiền" value={form.status} onChange={(event) => change({ status: event.target.value })}><option value="">Tất cả trạng thái</option><option value="pending">Chờ đủ 24 giờ</option><option value="available">Có thể rút</option><option value="disputed">Đang xem xét</option><option value="cancelled">Đã hủy</option></SelectInput></label>
        <Button size="sm" type="submit">Áp dụng</Button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        {data.transactions.items.length ? <table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-canvas text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Booking / cơ sở</th><th className="px-4 py-3">Nguồn thanh toán</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3 text-right">Khách trả</th><th className="px-4 py-3 text-right">Phí</th><th className="px-4 py-3 text-right">Đã hoàn</th><th className="px-4 py-3 text-right">Chủ sân nhận</th></tr></thead><tbody>{data.transactions.items.map((row) => {
          const venue = venues.find((item) => item.id === row.venueId);
          const [label, tone] = statusCopy[row.status];
          return <tr key={row.bookingId} className="cursor-pointer border-t border-line transition hover:bg-canvas" onClick={() => setSelected(row)}><td className="px-4 py-4"><p className="font-bold text-brand-navy">Booking {row.bookingCode ?? 'Chưa có mã'}</p><p className="mt-1 text-xs text-ink-500">{venue?.name ?? 'Cơ sở của bạn'}</p><p className="text-xs text-ink-500">{row.startAt ? `${formatDateTimeVi(row.startAt)} → ` : 'Kết thúc '}{formatDateTimeVi(row.endAt)}</p></td><td className="px-4 py-4"><p className="font-semibold text-info">{row.payment?.provider ?? 'Chưa có dữ liệu kênh'}</p><p className="mt-1 text-xs text-ink-500">{row.payment?.providerReference ? `Mã ${row.payment.providerReference}` : 'Không có mã ngân hàng'}</p></td><td className="px-4 py-4"><Badge tone={tone}>{label}</Badge></td><td className="text-figures px-4 py-4 text-right font-bold text-brand-navy">{formatMoneyVnd(row.gross)}</td><td className="text-figures px-4 py-4 text-right font-semibold text-warning">{formatMoneyVnd(row.commission)}</td><td className={`text-figures px-4 py-4 text-right font-semibold ${refundedOf(row) === '0' ? 'text-ink-300' : 'text-danger'}`}>{formatMoneyVnd(refundedOf(row))}</td><td className="text-figures px-4 py-4 text-right font-bold text-success">{formatMoneyVnd(row.net)}</td></tr>;
        })}</tbody></table> : <EmptyState title="Chưa có giao dịch phù hợp" description="Thử thay đổi cơ sở, ngày hoặc trạng thái." />}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink-500">Hiển thị {data.transactions.total ? (data.transactions.page - 1) * data.transactions.pageSize + 1 : 0}–{Math.min(data.transactions.page * data.transactions.pageSize, data.transactions.total)} / {data.transactions.total} giao dịch</p><Pagination page={data.transactions.page} pageCount={pageCount} onChange={(page) => onChange({ ...filters, page })} /></div>
    </section>
    <FinanceTraceDrawer row={selected} onClose={() => setSelected(null)} />
  </div>;
}
