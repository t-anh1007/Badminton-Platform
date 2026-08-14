import { useEffect, useState } from 'react';
import { Button, TextInput } from './ui';
import { MetricCard } from './courtin/MetricCard';
import { OperationsTable } from './courtin/OperationsTable';
import { cancelMyWithdrawal, createWithdrawal, getMyRevenue, getMyWallets, getMyWithdrawals, type RevenueRow, type WalletRow, type WithdrawalRow } from '../lib/financeApi';
import { parseDateFieldVi } from '../lib/formatters.js';

const money = (value: bigint | string) => `${BigInt(value).toLocaleString('vi-VN')}đ`;

export function FinancePanel() {
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [businessWallet, setBusinessWallet] = useState<WalletRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [filters, setFilters] = useState({ venueId: '', from: '', to: '' });
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ amount: '100000', bankCode: '', bankAccountNumber: '', bankAccountName: '' });
  const reload = () => {
    const from = filters.from ? parseDateFieldVi(filters.from) : undefined;
    const to = filters.to ? parseDateFieldVi(filters.to) : undefined;
    if ((filters.from && !from) || (filters.to && !to)) { setMessage('Ngày phải theo định dạng dd/MM/yyyy.'); return Promise.resolve(); }
    return getMyWallets().then(async (wallets) => {
    const business = wallets.find((wallet) => wallet.walletType === 'business') ?? null;
    setBusinessWallet(business);
    if (!business) { setRows([]); setWithdrawals([]); setLoaded(true); return; }
    const [nextRows, nextWithdrawals] = await Promise.all([getMyRevenue({ ...filters, from: from ?? '', to: to ?? '' }), getMyWithdrawals()]);
    setRows(nextRows);
    setWithdrawals(nextWithdrawals);
    setLoaded(true);
    }).catch((error: Error) => { setLoaded(true); setMessage(error.message); });
  };
  useEffect(() => { reload(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const request = await createWithdrawal(form);
      setMessage(`Đã tạo yêu cầu ${request.transferCode}. Tiền đã chuyển sang reserved.`);
      await reload();
    } catch (error) { setMessage((error as Error).message); }
  }

  if (loaded && !businessWallet) return null;

  return (
    <section className="mt-10" aria-labelledby="business-finance-title">
      <h2 id="business-finance-title" className="text-h2 mb-4 text-xl">Doanh thu và rút tiền</h2>
      <div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Đang chờ 24 giờ" value={money(businessWallet?.pending ?? '0')} /><MetricCard label="Có thể rút" value={money(businessWallet?.available ?? '0')} tone="navy" /><MetricCard label="Đang giữ cho yêu cầu rút" value={money(businessWallet?.reserved ?? '0')} tone="yellow" /></div>
      <div className="mt-4">
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); reload(); }}>
          <TextInput aria-label="Lọc cơ sở" value={filters.venueId} onChange={(e) => setFilters({ ...filters, venueId: e.target.value })} placeholder="Venue ID" />
          <TextInput aria-label="Từ ngày" inputMode="numeric" placeholder="dd/MM/yyyy" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <TextInput aria-label="Đến ngày" inputMode="numeric" placeholder="dd/MM/yyyy" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          <Button type="submit" size="sm">Lọc doanh thu</Button>
        </form>
        <OperationsTable caption="Doanh thu theo booking" columns={['Booking', 'Gộp', 'Đã hoàn', 'Hoa hồng', 'Ròng', 'Đáo hạn']}>{rows.map((row) => <tr key={row.bookingId} className="text-ink-700"><td className="px-5 py-3 text-figures">{row.bookingId}</td><td className="px-5 py-3 text-figures">{money(row.gross)}</td><td className="px-5 py-3 text-figures">{money(BigInt(row.gross) - BigInt(row.net) - BigInt(row.commission))}</td><td className="px-5 py-3 text-figures">{money(row.commission)}</td><td className="px-5 py-3 text-figures">{money(row.net)}</td><td className="px-5 py-3">{row.disputeOpen ? 'Hoãn do tranh chấp' : row.releasedAt ? 'Khả dụng' : new Date(row.releaseAt).toLocaleString('vi-VN')}</td></tr>)}</OperationsTable>
      </div>
      <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
        <TextInput aria-label="Số tiền rút" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Tối thiểu 100.000đ" />
        <TextInput aria-label="Ngân hàng" value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} placeholder="Mã ngân hàng" />
        <TextInput aria-label="Số tài khoản" value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} placeholder="Số tài khoản" />
        <TextInput aria-label="Tên tài khoản" value={form.bankAccountName} onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })} placeholder="Tên chủ tài khoản" />
        <Button type="submit">Tạo yêu cầu rút</Button>
      </form>
      <div className="mt-4 space-y-2">{withdrawals.map((row) => <div key={row.id} className="rounded-xl bg-surface p-3"><span>{row.transferCode} · {money(row.amount)} · {row.status}</span>{row.status === 'pending' && <button className="ml-3" onClick={() => cancelMyWithdrawal(row.id).then(reload).catch((error: Error) => setMessage(error.message))}>Hủy yêu cầu</button>}</div>)}</div>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </section>
  );
}
