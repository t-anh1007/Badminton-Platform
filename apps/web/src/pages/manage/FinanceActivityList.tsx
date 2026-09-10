import { useMemo, useState } from 'react';
import { Badge, Button, EmptyState, SelectInput, TextInput } from '../../components/ui';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import type { WalletLedgerEntry, WithdrawalRow } from '../../lib/financeApi.js';
import type { ManagedVenue } from '../../lib/venueBookingApi.js';

type Filter = 'all' | 'revenue' | 'withdrawal';
type Activity = {
  id: string;
  category: 'revenue' | 'withdrawal' | 'other';
  occurredAt: string;
  amount: bigint;
  positive: boolean;
  label: string;
  detail?: string;
  badge?: string;
};

const PAGE_SIZE = 6;

function toLedgerActivity(entry: WalletLedgerEntry): Activity {
  const amount = BigInt(entry.amount);
  const label = entry.type === 'release' ? 'Doanh thu đã khả dụng'
    : entry.type === 'payout' ? 'Chi rút tiền'
      : entry.type === 'reserve' ? 'Giữ tiền cho yêu cầu rút'
        : entry.type === 'refund' ? 'Điều chỉnh hoàn tiền'
          : entry.referenceSummary?.title ?? 'Biến động ví';
  return {
    id: `ledger-${entry.id}`,
    category: entry.type === 'payout' || entry.type === 'reserve' ? 'withdrawal' : entry.type === 'release' ? 'revenue' : 'other',
    occurredAt: entry.ts,
    amount,
    positive: amount > 0n,
    label,
    badge: entry.type === 'release' ? 'Đã khả dụng' : undefined,
  };
}

function toWithdrawalActivity(row: WithdrawalRow): Activity | null {
  if (row.status === 'rejected') {
    return {
      id: `withdrawal-${row.id}`,
      category: 'withdrawal',
      occurredAt: row.processedAt ?? row.createdAt ?? new Date(0).toISOString(),
      amount: BigInt(row.amount),
      positive: true,
      label: 'Yêu cầu rút tiền bị từ chối',
      detail: row.rejectionReason ? `Tiền đã hoàn vào số dư khả dụng · ${row.rejectionReason}` : 'Tiền đã hoàn vào số dư khả dụng',
      badge: 'Đã hoàn tiền',
    };
  }
  if (row.status === 'pending') {
    return {
      id: `withdrawal-${row.id}`,
      category: 'withdrawal',
      occurredAt: row.createdAt ?? new Date(0).toISOString(),
      amount: BigInt(row.amount),
      positive: false,
      label: 'Yêu cầu rút tiền đang chờ xử lý',
      detail: 'Tiền đang được giữ chờ chi',
      badge: 'Đang xử lý',
    };
  }
  return null;
}

export function FinanceActivityList({ ledger, withdrawals, venues, onApplyFilter }: { ledger: WalletLedgerEntry[]; withdrawals: WithdrawalRow[]; venues: ManagedVenue[]; onApplyFilter: (filters: { venueId: string; from: string; to: string }) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [advanced, setAdvanced] = useState(false);
  const [form, setForm] = useState({ venueId: '', from: '', to: '' });
  const activities = useMemo(() => [...ledger.map(toLedgerActivity), ...withdrawals.map(toWithdrawalActivity).filter((item): item is Activity => item !== null)]
    .filter((item) => filter === 'all' || item.category === filter)
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()), [filter, ledger, withdrawals]);
  const totalPages = Math.max(1, Math.ceil(activities.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = activities.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return <section aria-label="Hoạt động gần đây">
    <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="mr-auto text-h3">Hoạt động gần đây</h3>{(['all', 'revenue', 'withdrawal'] as Filter[]).map((item) => <Button key={item} size="sm" tone={filter === item ? 'primary' : 'secondary'} onClick={() => { setFilter(item); setPage(1); }}>{item === 'all' ? 'Tất cả' : item === 'revenue' ? 'Doanh thu' : 'Trạng thái rút'}</Button>)}<Button size="sm" tone="ghost" onClick={() => setAdvanced(!advanced)}>Bộ lọc</Button></div>
    {advanced && <form className="mb-3 grid gap-2 rounded-2xl border border-line bg-canvas p-3 sm:grid-cols-[1fr_150px_150px_auto]" onSubmit={(event) => { event.preventDefault(); onApplyFilter(form); }}>
      <SelectInput aria-label="Lọc cơ sở" value={form.venueId} onChange={(event) => setForm({ ...form, venueId: event.target.value })}><option value="">Tất cả cơ sở</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</SelectInput>
      <TextInput aria-label="Từ ngày" placeholder="dd/MM/yyyy" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} />
      <TextInput aria-label="Đến ngày" placeholder="dd/MM/yyyy" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} />
      <Button size="sm" type="submit">Áp dụng</Button>
    </form>}
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {visible.length === 0 ? <EmptyState title="Chưa có hoạt động" description="Các khoản doanh thu và rút tiền sẽ xuất hiện ở đây." /> : visible.map((activity) => {
        return <article key={activity.id} className="flex items-center gap-3 border-b border-line px-4 py-4 last:border-b-0"><span className={`grid h-10 w-10 place-items-center rounded-xl ${activity.positive ? 'bg-success-bg text-success' : 'bg-canvas text-ink-500'}`} aria-hidden="true">{activity.positive ? '↗' : '↓'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{activity.label}</p><p className="mt-0.5 text-caption text-ink-500">{activity.detail ?? formatDateTimeVi(activity.occurredAt)}</p>{activity.detail && <p className="mt-0.5 text-caption text-ink-500">{formatDateTimeVi(activity.occurredAt)}</p>}</div><div className="text-right"><p className={`text-figures text-sm font-semibold ${activity.positive ? 'text-success' : 'text-ink-900'}`}>{activity.positive ? '+' : ''}{formatMoneyVnd(activity.amount)}</p>{activity.badge && <Badge tone={activity.positive ? 'success' : 'neutral'}>{activity.badge}</Badge>}</div></article>;
      })}
    </div>
    {totalPages > 1 && <nav className="mt-3 flex items-center justify-center gap-3" aria-label="Phân trang hoạt động"><Button tone="secondary" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trang trước</Button><p className="text-caption text-ink-500">Trang {currentPage} / {totalPages}</p><Button tone="secondary" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Trang sau</Button></nav>}
  </section>;
}
