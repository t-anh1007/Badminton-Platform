import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Skeleton } from '../../components/ui';
import {
  cancelMyWithdrawal, createWithdrawal, getMyFinancialTransparency, getMyWithdrawals, getMyWallets,
  type ProviderTransparencyResult, type WalletRow, type WithdrawalRow,
} from '../../lib/financeApi.js';
import { getMyManagedVenues, type ManagedVenue } from '../../lib/venueBookingApi.js';
import { newPeriod, periodQuery } from '../../components/PeriodFilter.js';
import { FinanceRevenueExplorer, type FinanceFilter } from './FinanceRevenueExplorer.js';
import { FinanceWithdrawalHistory } from './FinanceWithdrawalHistory.js';
import { useFinanceRealtime } from './useFinanceRealtime.js';
import { WithdrawalModal } from './WithdrawalModal.js';
import { useLiveDataRefresh } from '../../realtime/dataInvalidation.js';

const ACTIVE_STATUSES = new Set(['pending', 'partially_paid']);

export function ManageFinancePage() {
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [venues, setVenues] = useState<ManagedVenue[]>([]);
  const [transparency, setTransparency] = useState<ProviderTransparencyResult | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  // Mặc định: từ ngày bỏ trống, đến hôm nay = toàn bộ booking tới hiện tại.
  const [filters, setFilters] = useState<FinanceFilter>({ venueId: '', period: newPeriod('range'), status: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async (nextFilters = filters) => {
    try {
      const wallets = await getMyWallets();
      const business = wallets.find((row) => row.walletType === 'business') ?? null;
      const [nextVenues, nextTransparency, nextWithdrawals] = await Promise.all([
        getMyManagedVenues().catch(() => [] as ManagedVenue[]),
        getMyFinancialTransparency({ venueId: nextFilters.venueId, ...periodQuery(nextFilters.period), status: nextFilters.status, page: nextFilters.page, pageSize: 5 }),
        getMyWithdrawals(),
      ]);
      setWallet(business); setVenues(nextVenues); setTransparency(nextTransparency); setWithdrawals(nextWithdrawals);
      setFilters(nextFilters); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu tài chính.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* Initial finance snapshot only. */ }, []);
  const { status } = useFinanceRealtime(() => load());
  useLiveDataRefresh(() => { if (!withdrawOpen) return load(); });
  const activeWithdrawal = useMemo(() => withdrawals.find((row) => ACTIVE_STATUSES.has(row.status)) ?? null, [withdrawals]);

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
    <section className="overflow-hidden rounded-2xl bg-brand-navy p-6 text-surface shadow-[var(--shadow-raised)] sm:p-8"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm text-surface/70">Số dư có thể rút</p><p className="text-figures mt-2 text-4xl font-bold">{new Intl.NumberFormat('vi-VN').format(BigInt(wallet.available))}đ</p><p className="mt-2 text-xs text-surface/70">{status === 'live' ? '● Đang cập nhật trực tiếp' : '○ Đang kết nối lại'}</p></div><Button onClick={() => setWithdrawOpen(true)} className="bg-brand-yellow text-brand-navy hover:bg-brand-yellow-hover">Rút tiền</Button></div></section>
    {transparency ? <FinanceRevenueExplorer data={transparency} venues={venues} filters={filters} onChange={(next) => void load(next)} /> : null}
    <FinanceWithdrawalHistory />
    {error && <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>}
    {message && !error && <p role="status" className="rounded-2xl bg-success-bg px-4 py-3 text-sm text-success">{message}</p>}
    <WithdrawalModal open={withdrawOpen} available={wallet.available} active={activeWithdrawal} busy={busy} onClose={() => setWithdrawOpen(false)} onSubmit={(body) => void submitWithdrawal(body)} onCancel={(id) => void cancelWithdrawal(id)} />
  </div>;
}
