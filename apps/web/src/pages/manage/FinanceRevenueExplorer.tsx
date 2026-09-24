import { useState } from 'react';
import { Badge, Button, EmptyState, Pagination, SelectInput, TextInput } from '../../components/ui.js';
import { FinanceTraceDrawer } from '../../components/FinanceTraceDrawer.js';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import type { ProviderTransparencyResult, ProviderTransparencyRow } from '../../lib/financeApi.js';
import type { ManagedVenue } from '../../lib/venueBookingApi.js';

type Filter = { venueId: string; from: string; to: string; status: string; page: number };
const statusCopy = {
  pending: ['Chờ đủ 24 giờ', 'warning'], available: ['Có thể rút', 'success'],
  disputed: ['Đang xem xét', 'danger'], cancelled: ['Đã hủy', 'neutral'],
} as const;

export function FinanceRevenueExplorer({ data, venues, filters, onChange }: {
  data: ProviderTransparencyResult; venues: ManagedVenue[]; filters: Filter; onChange: (filters: Filter) => void;
}) {
  const [form, setForm] = useState(filters);
  const [selected, setSelected] = useState<ProviderTransparencyRow | null>(null);
  const pageCount = Math.max(1, Math.ceil(data.transactions.total / data.transactions.pageSize));
  return <div className="grid gap-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Phân loại dòng tiền">
      <Bucket label="Tổng tiền khách trả" value={data.summary.gross} detail="Trong khoảng thời gian đang xem" color="text-brand-navy" />
      <Bucket label="Chờ đủ 24 giờ" value={data.summary.pending} detail="Chưa thể rút" color="text-warning" />
      <Bucket label="Có thể rút" value={data.summary.available} detail="Sẵn sàng tạo yêu cầu rút" color="text-success" />
      <Bucket label="Đang chuyển ngân hàng" value={data.summary.reserved} detail="Đã giữ cho yêu cầu rút" color="text-info" />
    </section>
    <section>
      <div className="mb-3 flex flex-wrap items-end gap-2"><div className="mr-auto"><h3 className="text-h3">Chi tiết từng booking</h3><p className="mt-1 text-sm text-ink-500">Mỗi hàng thể hiện tiền khách trả, phí nền tảng và phần chủ sân nhận.</p></div></div>
      <form className="mb-3 grid gap-2 rounded-2xl border border-line bg-canvas p-3 lg:grid-cols-[1fr_145px_145px_160px_auto]" onSubmit={(event) => { event.preventDefault(); onChange({ ...form, page: 1 }); }}>
        <SelectInput aria-label="Lọc cơ sở" value={form.venueId} onChange={(event) => setForm({ ...form, venueId: event.target.value })}><option value="">Tất cả cơ sở</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</SelectInput>
        <TextInput aria-label="Từ ngày" placeholder="dd/MM/yyyy" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} />
        <TextInput aria-label="Đến ngày" placeholder="dd/MM/yyyy" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} />
        <SelectInput aria-label="Trạng thái dòng tiền" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="">Tất cả trạng thái</option><option value="pending">Chờ đủ 24 giờ</option><option value="available">Có thể rút</option><option value="disputed">Đang xem xét</option><option value="cancelled">Đã hủy</option></SelectInput>
        <Button size="sm" type="submit">Áp dụng</Button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        {data.transactions.items.length ? <table className="w-full min-w-[840px] text-left text-sm"><thead className="bg-canvas text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Booking / cơ sở</th><th className="px-4 py-3">Nguồn thanh toán</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3 text-right">Khách trả</th><th className="px-4 py-3 text-right">Phí</th><th className="px-4 py-3 text-right">Chủ sân nhận</th></tr></thead><tbody>{data.transactions.items.map((row) => {
          const venue = venues.find((item) => item.id === row.venueId);
          const [label, tone] = statusCopy[row.status];
          return <tr key={row.bookingId} className="cursor-pointer border-t border-line transition hover:bg-canvas" onClick={() => setSelected(row)}><td className="px-4 py-4"><p className="font-bold text-brand-navy">Booking {row.bookingCode ?? 'Chưa có mã'}</p><p className="mt-1 text-xs text-ink-500">{venue?.name ?? 'Cơ sở của bạn'} · kết thúc {formatDateTimeVi(row.endAt)}</p></td><td className="px-4 py-4"><p className="font-semibold text-info">{row.payment?.provider ?? 'Chưa có dữ liệu kênh'}</p><p className="mt-1 text-xs text-ink-500">{row.payment?.providerReference ? `Mã ${row.payment.providerReference}` : 'Không có mã ngân hàng'}</p></td><td className="px-4 py-4"><Badge tone={tone}>{label}</Badge></td><td className="text-figures px-4 py-4 text-right font-bold text-brand-navy">{formatMoneyVnd(row.gross)}</td><td className="text-figures px-4 py-4 text-right font-semibold text-warning">{formatMoneyVnd(row.commission)}</td><td className="text-figures px-4 py-4 text-right font-bold text-success">{formatMoneyVnd(row.net)}</td></tr>;
        })}</tbody></table> : <EmptyState title="Chưa có giao dịch phù hợp" description="Thử thay đổi cơ sở, ngày hoặc trạng thái." />}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink-500">Hiển thị {data.transactions.total ? (data.transactions.page - 1) * data.transactions.pageSize + 1 : 0}–{Math.min(data.transactions.page * data.transactions.pageSize, data.transactions.total)} / {data.transactions.total} giao dịch</p><Pagination page={data.transactions.page} pageCount={pageCount} onChange={(page) => onChange({ ...filters, page })} /></div>
    </section>
    <FinanceTraceDrawer row={selected} onClose={() => setSelected(null)} />
  </div>;
}

function Bucket({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return <article className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]"><p className="text-caption text-ink-500">{label}</p><p className={`text-figures mt-2 text-2xl font-semibold ${color}`}>{formatMoneyVnd(value)}</p><p className="mt-2 text-xs text-ink-500">{detail}</p></article>;
}
