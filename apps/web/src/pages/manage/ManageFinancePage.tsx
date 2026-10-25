import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, EmptyState, SegmentedControl, Skeleton } from '../../components/ui';
import { formatMoneyVnd } from '../../lib/formatters.js';
import {
  cancelMyWithdrawal, createWithdrawal, getMyFinancialTransparency, getMyWithdrawals, getMyWallets,
  type ProviderTransparencyResult, type WalletRow, type WithdrawalRow,
} from '../../lib/financeApi.js';
import { getMyManagedVenues, type ManagedVenue } from '../../lib/venueBookingApi.js';
import { newPeriod, periodQuery } from '../../components/PeriodFilter.js';
import { FinanceRevenueExplorer, type FinanceFilter } from './FinanceRevenueExplorer.js';
import { ProviderFinanceFlows } from './ProviderFinanceFlows.js';
import type { FlowNavState, FlowSync } from '../../components/FinanceFlows.js';
import type { ProviderFlowTab } from '../../lib/financeApi.js';
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
  const [filters, setFilters] = useState<FinanceFilter>({ venueId: '', period: newPeriod('range') });
  // ?tab=transactions mở thẳng tab Giao dịch; ?withdrawal=… (link thông báo) mở Giao dịch › Rút tiền.
  const [params, setParams] = useSearchParams();
  const tab = params.has('withdrawal') || params.get('tab') === 'transactions' ? 'transactions' : 'overview';
  const setTab = (next: 'overview' | 'transactions') => setParams(next === 'transactions' ? { tab: 'transactions' } : {}, { replace: true });
  const [flowNav, setFlowNav] = useState<FlowNavState<ProviderFlowTab>>(() => ({ tab: params.has('withdrawal') ? 'withdraw' : 'revenue', nonce: 0 }));
  const [flowSync, setFlowSync] = useState<FlowSync>({ nonce: 0 });
  const pushSync = (next: Omit<FlowSync, 'nonce'>) => setFlowSync((current) => ({ ...next, nonce: current.nonce + 1 }));
  const [version, setVersion] = useState(0);
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
        getMyFinancialTransparency({ venueId: nextFilters.venueId, ...periodQuery(nextFilters.period), page: 1, pageSize: 1 }),
        getMyWithdrawals(),
      ]);
      setWallet(business); setVenues(nextVenues); setTransparency(nextTransparency); setWithdrawals(nextWithdrawals);
      setFilters(nextFilters); setVersion((current) => current + 1); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu tài chính.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* Initial finance snapshot only. */ }, []);
  const { status } = useFinanceRealtime(() => load());
  useLiveDataRefresh(() => { if (!withdrawOpen) return load(); });
  const openFlows = (tab: ProviderFlowTab, filter?: string) => {
    setFlowNav((current) => ({ tab, filter, nonce: current.nonce + 1 }));
    setTab('transactions');
  };
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

  return <div className="grid gap-5">
    <h1 className="text-h2">Tài chính</h1>
    <section className="rounded-2xl bg-brand-navy p-6 text-surface shadow-[var(--shadow-raised)] sm:px-7"><div className="flex flex-wrap items-center justify-between gap-5"><div><p className="text-sm text-surface/70">Số dư có thể rút</p><p className="text-figures mt-1 text-4xl font-bold">{new Intl.NumberFormat('vi-VN').format(BigInt(wallet.available))}đ</p><p className="mt-2 text-xs text-surface/70">Chờ đủ 24 giờ: <strong className="text-figures">{formatMoneyVnd(wallet.pending)}</strong> · Đang chuyển ngân hàng: <strong className="text-figures">{formatMoneyVnd(wallet.reserved)}</strong> · {status === 'live' ? 'cập nhật trực tiếp' : 'đang kết nối lại'}</p></div><div className="flex flex-wrap gap-2"><Button tone="secondary" size="sm" onClick={() => openFlows('ledger')} className="!border-surface/35 !bg-transparent !text-surface hover:!bg-surface/10">Xem sổ ví</Button><Button aria-label="Tạo yêu cầu rút tiền" onClick={() => setWithdrawOpen(true)}>Rút tiền</Button></div></div></section>
    <div><SegmentedControl options={[{ value: 'overview', label: 'Tổng quan' }, { value: 'transactions', label: 'Giao dịch' }]} value={tab} onChange={setTab} /></div>
    {tab === 'overview' ? (transparency ? <FinanceRevenueExplorer data={transparency} venues={venues} filters={filters}
      onChange={(next) => { setFilters(next); pushSync({ period: next.period, venueId: next.venueId }); void load(next); }}
      onPickDay={(picked) => { pushSync({ period: { ...newPeriod('day'), day: picked } }); openFlows('revenue'); }}
      onPickVenue={(venueId) => { const next = { ...filters, venueId }; setFilters(next); pushSync({ venueId }); void load(next); openFlows('revenue'); }}
      onShowPending={() => { const next = { ...filters, period: newPeriod('all') }; setFilters(next); pushSync({ period: next.period }); void load(next); openFlows('revenue', 'pending'); }} /> : null)
      : <ProviderFinanceFlows nav={flowNav} venues={venues} sync={flowSync} initialPeriod={filters.period} version={version} />}
    {error && <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>}
    {message && !error && <p role="status" className="rounded-2xl bg-success-bg px-4 py-3 text-sm text-success">{message}</p>}
    <WithdrawalModal open={withdrawOpen} available={wallet.available} active={activeWithdrawal} busy={busy} onClose={() => setWithdrawOpen(false)} onSubmit={(body) => void submitWithdrawal(body)} onCancel={(id) => void cancelWithdrawal(id)} />
  </div>;
}
