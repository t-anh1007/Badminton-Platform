import { useEffect, useState } from 'react';
import { Badge, EmptyState, Pagination } from '../../components/ui.js';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import { getMyWithdrawalTransparency, type FinancePage, type ProviderWithdrawalTransparencyRow } from '../../lib/financeApi.js';

const statusLabel: Record<string, string> = { pending: 'Đang chờ xử lý', partially_paid: 'Đã chuyển một phần', paid: 'Đã chuyển thành công', rejected: 'Không được duyệt' };

export function FinanceWithdrawalHistory() {
  const [data, setData] = useState<FinancePage<ProviderWithdrawalTransparencyRow> | null>(null);
  const [error, setError] = useState('');
  const load = async (page: number) => { try { setData(await getMyWithdrawalTransparency(page, 20)); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải lịch sử rút tiền.'); } };
  useEffect(() => { void load(1); }, []);
  if (error) return <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-ink-500">Đang tải lịch sử rút tiền…</p>;
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  return <section><div className="mb-3"><h3 className="text-h3">Lịch sử chuyển tiền về ngân hàng</h3><p className="mt-1 text-sm text-ink-500">Tài khoản nhận được che bớt; số tiền và trạng thái luôn hiển thị đầy đủ.</p></div>
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">{data.items.length ? data.items.map((row) => <article key={row.id} className="grid gap-3 border-b border-line p-4 last:border-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-bold text-brand-navy">{row.bankAccountName} · {row.bankCode} {row.bankAccountMasked}</p><p className="mt-1 text-xs text-ink-500">Mã yêu cầu {row.transferCode} · tạo {formatDateTimeVi(row.createdAt)}</p>{row.providerReference ? <p className="mt-1 text-xs text-info">Mã ngân hàng {row.providerReference}</p> : null}</div><Badge tone={row.status === 'paid' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'}>{statusLabel[row.status] ?? row.status}</Badge><p className={`text-figures text-right font-bold ${row.status === 'paid' ? 'text-success' : 'text-info'}`}>{formatMoneyVnd(row.paidAmount === '0' ? row.amount : row.paidAmount)}</p></article>) : <EmptyState title="Chưa có yêu cầu rút tiền" description="Các lần chuyển tiền về ngân hàng sẽ xuất hiện tại đây." />}</div>
    {pageCount > 1 ? <div className="mt-4"><Pagination page={data.page} pageCount={pageCount} onChange={(page) => void load(page)} /></div> : null}
  </section>;
}
