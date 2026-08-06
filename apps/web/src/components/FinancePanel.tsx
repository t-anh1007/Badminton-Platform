import { useEffect, useState } from 'react';
import { Card } from './Card';
import { cancelMyWithdrawal, createWithdrawal, getMyRevenue, getMyWallets, getMyWithdrawals, type RevenueRow, type WalletRow, type WithdrawalRow } from '../lib/financeApi';

const money = (value: bigint | string) => `${BigInt(value).toLocaleString('vi-VN')}đ`;

export function FinancePanel() {
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [businessWallet, setBusinessWallet] = useState<WalletRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [filters, setFilters] = useState({ venueId: '', from: '', to: '' });
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ amount: '100000', bankCode: '', bankAccountNumber: '', bankAccountName: '' });
  const reload = () => getMyWallets().then(async (wallets) => {
    const business = wallets.find((wallet) => wallet.walletType === 'business') ?? null;
    setBusinessWallet(business);
    if (!business) { setRows([]); setWithdrawals([]); setLoaded(true); return; }
    const [nextRows, nextWithdrawals] = await Promise.all([getMyRevenue(filters), getMyWithdrawals()]);
    setRows(nextRows);
    setWithdrawals(nextWithdrawals);
    setLoaded(true);
  }).catch((error: Error) => { setLoaded(true); setMessage(error.message); });
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-caption">Đang chờ 24 giờ</p><p className="text-figures text-xl">{money(businessWallet?.pending ?? '0')}</p></Card>
        <Card><p className="text-caption">Có thể rút</p><p className="text-figures text-xl">{money(businessWallet?.available ?? '0')}</p></Card>
        <Card><p className="text-caption">Đang giữ cho yêu cầu rút</p><p className="text-figures text-xl">{money(businessWallet?.reserved ?? '0')}</p></Card>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl bg-bg-white p-4">
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); reload(); }}>
          <input aria-label="Lọc cơ sở" value={filters.venueId} onChange={(e) => setFilters({ ...filters, venueId: e.target.value })} placeholder="Venue ID" />
          <input aria-label="Từ ngày" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <input aria-label="Đến ngày" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          <button type="submit">Lọc doanh thu</button>
        </form>
        <table className="w-full text-left text-sm"><thead><tr><th>Booking</th><th>Gộp</th><th>Đã hoàn</th><th>Hoa hồng còn lại</th><th>Ròng còn lại</th><th>Đáo hạn</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.bookingId}><td>{row.bookingId}</td><td>{money(row.gross)}</td><td>{money(BigInt(row.gross) - BigInt(row.net) - BigInt(row.commission))}</td><td>{money(row.commission)}</td><td>{money(row.net)}</td><td>{row.disputeOpen ? 'Hoãn do tranh chấp' : row.releasedAt ? 'Khả dụng' : new Date(row.releaseAt).toLocaleString('vi-VN')}</td></tr>)}</tbody>
        </table>
      </div>
      <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl bg-bg-white p-4 sm:grid-cols-2">
        <input aria-label="Số tiền rút" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Tối thiểu 100.000đ" />
        <input aria-label="Ngân hàng" value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} placeholder="Mã ngân hàng" />
        <input aria-label="Số tài khoản" value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} placeholder="Số tài khoản" />
        <input aria-label="Tên tài khoản" value={form.bankAccountName} onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })} placeholder="Tên chủ tài khoản" />
        <button className="rounded-full bg-primary-navy px-4 py-2 text-on-dark" type="submit">Tạo yêu cầu rút</button>
      </form>
      <div className="mt-4 space-y-2">{withdrawals.map((row) => <div key={row.id} className="rounded-xl bg-bg-white p-3"><span>{row.transferCode} · {money(row.amount)} · {row.status}</span>{row.status === 'pending' && <button className="ml-3" onClick={() => cancelMyWithdrawal(row.id).then(reload).catch((error: Error) => setMessage(error.message))}>Hủy yêu cầu</button>}</div>)}</div>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </section>
  );
}
