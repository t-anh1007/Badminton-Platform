import { useMemo, useState } from 'react';
import { Badge, Button, EmptyState, SelectInput, TextInput } from '../../components/ui';
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js';
import type { WalletLedgerEntry } from '../../lib/financeApi.js';
import type { ManagedVenue } from '../../lib/venueBookingApi.js';

type Filter = 'all' | 'revenue' | 'withdrawal';

export function FinanceActivityList({ ledger, venues, onApplyFilter }: { ledger: WalletLedgerEntry[]; venues: ManagedVenue[]; onApplyFilter: (filters: { venueId: string; from: string; to: string }) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [form, setForm] = useState({ venueId: '', from: '', to: '' });
  const visible = useMemo(() => ledger.filter((entry) => filter === 'all' || (filter === 'revenue' ? entry.amount.startsWith('+') || BigInt(entry.amount) > 0n : entry.type === 'payout' || entry.type === 'reserve')).slice(0, expanded ? 30 : 6), [ledger, filter, expanded]);
  const label = (entry: WalletLedgerEntry) => entry.type === 'release' ? 'Doanh thu đã khả dụng' : entry.type === 'payout' ? 'Chi rút tiền' : entry.type === 'reserve' ? 'Giữ tiền cho yêu cầu rút' : entry.type === 'refund' ? 'Điều chỉnh hoàn tiền' : entry.referenceSummary?.title ?? 'Biến động ví';
  return <section aria-label="Hoạt động gần đây">
    <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="mr-auto text-h3">Hoạt động gần đây</h3>{(['all', 'revenue', 'withdrawal'] as Filter[]).map((item) => <Button key={item} size="sm" tone={filter === item ? 'primary' : 'secondary'} onClick={() => setFilter(item)}>{item === 'all' ? 'Tất cả' : item === 'revenue' ? 'Doanh thu' : 'Chi tiền'}</Button>)}<Button size="sm" tone="ghost" onClick={() => setAdvanced(!advanced)}>Bộ lọc</Button></div>
    {advanced && <form className="mb-3 grid gap-2 rounded-2xl border border-line bg-canvas p-3 sm:grid-cols-[1fr_150px_150px_auto]" onSubmit={(event) => { event.preventDefault(); onApplyFilter(form); }}>
      <SelectInput aria-label="Lọc cơ sở" value={form.venueId} onChange={(event) => setForm({ ...form, venueId: event.target.value })}><option value="">Tất cả cơ sở</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</SelectInput>
      <TextInput aria-label="Từ ngày" placeholder="dd/MM/yyyy" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} />
      <TextInput aria-label="Đến ngày" placeholder="dd/MM/yyyy" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} />
      <Button size="sm" type="submit">Áp dụng</Button>
    </form>}
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {visible.length === 0 ? <EmptyState title="Chưa có hoạt động" description="Các khoản doanh thu và rút tiền sẽ xuất hiện ở đây." /> : visible.map((entry) => {
        const amount = BigInt(entry.amount); const positive = amount > 0n;
        return <article key={entry.id} className="flex items-center gap-3 border-b border-line px-4 py-4 last:border-b-0"><span className={`grid h-10 w-10 place-items-center rounded-xl ${positive ? 'bg-success-bg text-success' : 'bg-canvas text-ink-500'}`} aria-hidden="true">{positive ? '↗' : '↓'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">{label(entry)}</p><p className="mt-0.5 text-caption text-ink-500">{formatDateTimeVi(entry.ts)}</p></div><div className="text-right"><p className={`text-figures text-sm font-semibold ${positive ? 'text-success' : 'text-ink-900'}`}>{positive ? '+' : ''}{formatMoneyVnd(amount)}</p>{entry.type === 'release' && <Badge tone="success">Đã khả dụng</Badge>}</div></article>;
      })}
    </div>
    {ledger.length > visible.length && <div className="mt-3 text-center"><Button tone="ghost" size="sm" onClick={() => setExpanded(!expanded)}>{expanded ? 'Thu gọn' : 'Xem tất cả hoạt động'}</Button></div>}
  </section>;
}
