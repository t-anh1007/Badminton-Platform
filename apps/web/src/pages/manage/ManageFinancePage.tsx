import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Skeleton } from '../../components/ui';
import {
  cancelMyWithdrawal, createWithdrawal, getMyRevenue, getMyWithdrawals, getMyWallets, getWalletLedger,
  type RevenueRow, type WalletLedgerEntry, type WalletRow, type WithdrawalRow,
} from '../../lib/financeApi.js';
import { getMyManagedVenues, type ManagedVenue } from '../../lib/venueBookingApi.js';
import { parseDateFieldVi } from '../../lib/formatters.js';
import { FinanceActivityList } from './FinanceActivityList.js';
import { FinanceOverview } from './FinanceOverview.js';
import { useFinanceRealtime } from './useFinanceRealtime.js';
import { WithdrawalModal } from './WithdrawalModal.js';

const ACTIVE_STATUSES = new Set(['pending', 'partially_paid']);
const vietnamDayBoundary = (date: string, edge: 'start' | 'end') => `${date}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}+07:00`;
const todayVi = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

export function ManageFinancePage() {
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [venues, setVenues] = useState<ManagedVenue[]>([]);
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [filters, setFilters] = useState({ venueId: '', from: todayVi(), to: todayVi() });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async (nextFilters = filters) => {
    const from = parseDateFieldVi(nextFilters.from);
    const to = parseDateFieldVi(nextFilters.to);
    if (!from || !to) { setError('Ngày cần theo định dạng dd/MM/yyyy.'); return; }
    try {
      const wallets = await getMyWallets();
      const business = wallets.find((row) => row.walletType === 'business') ?? null;
      const [nextVenues, nextRevenue, nextWithdrawals, nextLedger] = await Promise.all([
        getMyManagedVenues().catch(() => [] as ManagedVenue[]),
        getMyRevenue({ venueId: nextFilters.venueId, from: vietnamDayBoundary(from, 'start'), to: vietnamDayBoundary(to, 'end') }),
        getMyWithdrawals(),
        business ? getWalletLedger(business.id).then((result) => result.entries) : Promise.resolve([]),
      ]);
      setWallet(business); setVenues(nextVenues); setRevenue(nextRevenue); setWithdrawals(nextWithdrawals); setLedger(nextLedger);
      setFilters(nextFilters); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu tài chính.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* Initial finance snapshot only. */ }, []);
  const { status } = useFinanceRealtime(() => load());
  const activeWithdrawal = useMemo(() => withdrawals.find((row) => ACTIVE_STATUSES.has(row.status)) ?? null, [withdrawals]);
  const today = useMemo(() => revenue.reduce((total, row) => total + BigInt(row.net), 0n), [revenue]);

  const submitWithdrawal = async (body: { amount: string; bankCode: string; bankAccountNumber: string; bankAccountName: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      const request = await createWithdrawal(body);
      setMessage(`Đã tạo yêu cầu rút ${request.transferCode}. Tiền đang được giữ chờ chi.`);
      setError(''); setWithdrawOpen(false); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tạo yêu cầu rút.'); }
    finally { setBusy(false); }
  };
  const cancelWithdrawal = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try { await cancelMyWithdrawal(id); setMessage('Đã hủy yêu cầu rút. Tiền đã quay lại số dư khả dụng.'); setError(''); setWithdrawOpen(false); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể hủy yêu cầu rút.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="grid gap-6"><Skeleton className="h-64" /><Skeleton className="h-72" /></div>;
  if (!wallet) return <EmptyState title="Chưa có ví kinh doanh" description="Ví kinh doanh sẽ xuất hiện sau khi cơ sở của bạn được duyệt." />;

  return <div className="grid gap-7">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-caption text-ink-500">QUẢN LÝ TÀI CHÍNH</p><h2 className="mt-1 text-h1">Dòng tiền hôm nay</h2><p className="mt-1 text-sm text-ink-500">Xem tiền có thể rút và hoạt động mới nhất của các cơ sở.</p></div><Button tone="ghost" size="sm" onClick={() => void load()}>Tải lại</Button></header>
    <FinanceOverview available={wallet.available} pending={wallet.pending} todayNet={today.toString()} todayCount={revenue.length} activeWithdrawal={activeWithdrawal} status={status} onWithdraw={() => setWithdrawOpen(true)} />
    <FinanceActivityList ledger={ledger} withdrawals={withdrawals} venues={venues} onApplyFilter={(nextFilters) => void load(nextFilters)} />
    {error && <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>}
    {message && !error && <p role="status" className="rounded-2xl bg-success-bg px-4 py-3 text-sm text-success">{message}</p>}
    <WithdrawalModal open={withdrawOpen} available={wallet.available} active={activeWithdrawal} busy={busy} onClose={() => setWithdrawOpen(false)} onSubmit={(body) => void submitWithdrawal(body)} onCancel={(id) => void cancelWithdrawal(id)} />
  </div>;
}
