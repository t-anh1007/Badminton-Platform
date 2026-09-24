import { Badge, Pagination } from './ui.js';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';
import type { AdminTransparencyResult } from '../lib/financeApi.js';

export function FinancePlatformOverview({ data, onPageChange }: { data: AdminTransparencyResult; onPageChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(data.transactions.total / data.transactions.pageSize));
  const balanced = data.summary.difference === '0';
  const stages = [
    ['Tiền khách thanh toán', data.summary.customerPayments, 'text-brand-navy'],
    ['Chờ chuyển cho chủ sân', data.summary.ownerPending, 'text-warning'],
    ['Chủ sân có thể rút', data.summary.ownerAvailable, 'text-success'],
    ['Đang chuyển ngân hàng', data.summary.reservedPayout, 'text-info'],
    ['Đã chuyển ngân hàng', data.summary.paidPayout, 'text-success'],
    ['Doanh thu nền tảng', data.summary.platformRevenue, 'text-brand-navy'],
  ] as const;
  return <div className="grid gap-5">
    <section className="rounded-2xl bg-brand-navy p-5 text-surface shadow-[var(--shadow-raised)] sm:p-6"><div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center"><Metric label="Theo giao dịch ngân hàng" value={data.summary.bankMovement} /><span className="hidden text-2xl font-bold text-brand-yellow md:block">↔</span><Metric label="Đã có đối ứng trong hệ thống" value={data.summary.allocatedMovement} /><span className="hidden text-2xl font-bold text-brand-yellow md:block">→</span><div className={`rounded-xl border p-4 ${balanced ? 'border-success/40 bg-success/15' : 'border-danger/40 bg-danger/15'}`}><p className="text-xs text-surface/70">Chênh lệch cần xử lý</p><p className={`text-figures mt-1 text-2xl font-bold ${balanced ? 'text-brand-yellow' : 'text-surface'}`}>{formatMoneyVnd(data.summary.difference)} {balanced ? '✓' : ''}</p></div></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{stages.map(([label, value, color]) => <article key={label} className="rounded-2xl border border-line bg-surface p-4"><p className="text-caption text-ink-500">{label}</p><p className={`text-figures mt-2 text-xl font-bold ${color}`}>{formatMoneyVnd(value)}</p></article>)}</section>
    <section><div className="mb-3"><h3 className="text-h2">Giao dịch ngân hàng và đối soát</h3><p className="mt-1 text-sm text-ink-500">Danh sách tiền vào, tiền ra và kết quả ghép với nghiệp vụ trong COURTIN.</p></div><div className="overflow-x-auto rounded-2xl border border-line bg-surface"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-canvas text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Giao dịch</th><th className="px-4 py-3">Hướng tiền</th><th className="px-4 py-3">Nội dung nhận diện</th><th className="px-4 py-3">Đối soát</th><th className="px-4 py-3 text-right">Số tiền</th></tr></thead><tbody>{data.transactions.items.map((row) => {
      const matched = row.status !== 'unmatched';
      return <tr key={row.id} className="border-t border-line hover:bg-canvas"><td className="px-4 py-4"><p className="font-bold text-brand-navy">{row.businessCode ?? 'Chưa có mã giao dịch'}</p><p className="mt-1 text-xs text-ink-500">{formatDateTimeVi(row.receivedAt)}</p><details className="mt-1 text-xs text-ink-500"><summary className="cursor-pointer">Tham chiếu {row.provider}</summary><span className="mt-1 block break-all">{row.providerReference || 'Không có mã từ ngân hàng'}</span></details></td><td className={`px-4 py-4 font-bold ${row.direction === 'in' ? 'text-success' : 'text-info'}`}>{row.direction === 'in' ? 'Tiền vào' : 'Tiền ra'}</td><td className="px-4 py-4"><p className="font-semibold text-ink-900">{row.businessReference || 'Không có mã nhận diện'}</p><p className="mt-1 text-xs text-ink-500">Đã ghi nhận {formatMoneyVnd(row.allocatedAmount)}</p></td><td className="px-4 py-4"><Badge tone={matched ? 'success' : 'danger'}>{matched ? 'Đã có đối ứng' : 'Cần xử lý'}</Badge></td><td className={`text-figures px-4 py-4 text-right font-bold ${row.direction === 'in' ? 'text-success' : 'text-info'}`}>{row.direction === 'in' ? '+' : '−'}{formatMoneyVnd(row.amount)}</td></tr>;
    })}</tbody></table></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink-500">Hiển thị {data.transactions.total ? (data.transactions.page - 1) * data.transactions.pageSize + 1 : 0}–{Math.min(data.transactions.page * data.transactions.pageSize, data.transactions.total)} / {data.transactions.total} giao dịch</p><Pagination page={data.transactions.page} pageCount={pageCount} onChange={onPageChange} /></div></section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-surface/70">{label}</p><p className="text-figures mt-1 text-2xl font-bold">{formatMoneyVnd(value)}</p></div>; }
