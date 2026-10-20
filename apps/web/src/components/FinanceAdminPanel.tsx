import { BusinessCode } from './BusinessCode.js';
import { useEffect, useMemo, useState } from 'react';
import { confirmManualWithdrawalPayout, finalizePartialWithdrawal, getAdminWithdrawals, getReconciliationQueue, markOutOfScope, reconcileIncoming, reconcileOutgoing, rejectWithdrawal, type ReconciliationRow, type WithdrawalRow } from '../lib/financeApi';
import { getAdminAccountIdentities, getAdminAccounts, type AdminAccountIdentity } from '../lib/accountApi';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';
import { Badge, Button, EmptyState, Modal, Pagination, SelectInput, TextInput } from './ui';
import { SepayPayBox } from './SepayPayBox.js';
import { useLiveDataRefresh } from '../realtime/dataInvalidation.js';

type PendingAction = { label: string; reason: string; task: () => Promise<unknown> };
type WithdrawalAction = { id: string; kind: 'reject' | 'finalize' | 'manual' };
type ReconciliationAction = { id: string; kind: 'incoming' | 'outgoing' | 'outOfScope' };

const withdrawalStatusLabel = (status: string) => ({ pending: 'Chờ đối soát chi', partially_paid: 'Đã chi một phần', paid: 'Đã chi', rejected: 'Đã từ chối' } as Record<string, string>)[status] ?? status;
const withdrawalStatusTone = (status: string) => status === 'pending' || status === 'partially_paid' ? 'warning' : status === 'paid' ? 'success' : status === 'rejected' ? 'danger' : 'neutral';
const PAGE_SIZE = 20;
const dateValue = (value?: string | null) => value ? new Date(value).getTime() : 0;
const includesText = (values: Array<string | null | undefined>, query: string) => values.some((value) => value?.toLocaleLowerCase('vi').includes(query));
const withdrawalQr = (row: WithdrawalRow) => {
  const amount = (BigInt(row.amount) - BigInt(row.paidAmount)).toString();
  const query = new URLSearchParams({
    acc: row.bankAccountNumber,
    bank: row.bankCode,
    amount,
    des: row.transferCode,
    template: 'compact',
  });
  return {
    bankCode: row.bankCode,
    accountNumber: row.bankAccountNumber,
    accountName: row.bankAccountName,
    amount,
    matchCode: row.transferCode,
    qrImageUrl: `https://qr.sepay.vn/img?${query.toString()}`,
  };
};

/** focusId: yêu cầu rút được mở từ thông báo → đưa lên đầu và tô viền. */
export function FinanceAdminPanel({ mode, focusId }: { mode: 'withdrawals' | 'reconciliation'; focusId?: string | null }) {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [events, setEvents] = useState<ReconciliationRow[]>([]);
  const [withdrawalAction, setWithdrawalAction] = useState<WithdrawalAction | null>(null);
  const [reconciliationAction, setReconciliationAction] = useState<ReconciliationAction | null>(null);
  const [reconciliationTargets, setReconciliationTargets] = useState<Record<string, string>>({});
  const [reconciliationReasons, setReconciliationReasons] = useState<Record<string, string>>({});
  const [qrWithdrawal, setQrWithdrawal] = useState<WithdrawalRow | null>(null);
  const [withdrawalReasons, setWithdrawalReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);
  const [accountIdentities, setAccountIdentities] = useState<Map<string, AdminAccountIdentity>>(() => new Map());
  // Gán tiền vào ví cá nhân: tìm trong toàn bộ tài khoản, không chỉ người từng rút tiền.
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientResults, setRecipientResults] = useState<AdminAccountIdentity[] | null>(null);
  useEffect(() => {
    const query = recipientQuery.trim();
    if (query.length < 2) { setRecipientResults(null); return; }
    const timer = window.setTimeout(() => {
      getAdminAccounts({ query }).then(
        (rows) => setRecipientResults(rows.slice(0, 20).map((row) => ({ id: row.id, email: row.email, displayName: row.displayName, businessCode: row.businessCode }))),
        () => setRecipientResults([]),
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [recipientQuery]);
  useEffect(() => { setRecipientQuery(''); }, [reconciliationAction?.id]);

  const reload = async () => {
    try {
      if (mode === 'withdrawals') {
        const rows = await getAdminWithdrawals();
        setWithdrawals(rows);
        const identities = await getAdminAccountIdentities([...new Set(rows.map((row) => row.sellerUserId))]);
        setAccountIdentities(new Map(identities.map((identity) => [identity.id, identity])));
      } else {
        const [reconciliationRows, withdrawalRows] = await Promise.all([getReconciliationQueue(), getAdminWithdrawals()]);
        setEvents(reconciliationRows);
        setWithdrawals(withdrawalRows);
        const identities = await getAdminAccountIdentities([...new Set(withdrawalRows.map((row) => row.sellerUserId))]);
        setAccountIdentities(new Map(identities.map((identity) => [identity.id, identity])));
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  useEffect(() => { void reload(); }, [mode]);
  useLiveDataRefresh(reload);

  // QR is an external-bank handoff: after the Admin transfers, only the SePay
  // webhook can authoritatively settle it. Poll narrowly while this modal is
  // open so an already-confirmed payout never leaves the Admin on stale QR UI.
  useEffect(() => {
    const withdrawalId = qrWithdrawal?.id;
    if (!withdrawalId) return;
    let active = true;
    const refreshQrStatus = async () => {
      try {
        const rows = await getAdminWithdrawals();
        if (!active) return;
        setWithdrawals(rows);
        const latest = rows.find((row) => row.id === withdrawalId);
        if (!latest || (latest.status !== 'pending' && latest.status !== 'partially_paid')) {
          setQrWithdrawal(null);
          setMessage('SePay đã xác nhận giao dịch. Yêu cầu rút đã được cập nhật.');
          return;
        }
        setQrWithdrawal(latest);
      } catch {
        // Keep QR usable during a transient refresh failure; the next interval retries.
      }
    };
    void refreshQrStatus();
    const timer = window.setInterval(() => void refreshQrStatus(), 1_500);
    return () => { active = false; window.clearInterval(timer); };
  }, [qrWithdrawal?.id]);

  useEffect(() => { setPage(1); }, [directionFilter, query, sortBy, statusFilter]);

  const filteredWithdrawals = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    return withdrawals
      .filter((row) => statusFilter === 'all' || row.status === statusFilter)
      .filter((row) => !normalizedQuery || includesText([row.transferCode, row.sellerUserId, row.bankCode, row.bankAccountNumber, row.bankAccountName], normalizedQuery))
      .toSorted((left, right) => {
        if (focusId && (left.id === focusId) !== (right.id === focusId)) return left.id === focusId ? -1 : 1;
        if (sortBy === 'amount-desc') return Number(BigInt(right.amount) - BigInt(left.amount));
        if (sortBy === 'amount-asc') return Number(BigInt(left.amount) - BigInt(right.amount));
        if (sortBy === 'oldest') return dateValue(left.createdAt) - dateValue(right.createdAt);
        return dateValue(right.createdAt) - dateValue(left.createdAt);
      });
  }, [focusId, query, sortBy, statusFilter, withdrawals]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    return events
      .filter((event) => directionFilter === 'all' || event.direction === directionFilter)
      .filter((event) => !normalizedQuery || includesText([event.businessCode, event.rawRef, event.id], normalizedQuery))
      .toSorted((left, right) => {
        if (sortBy === 'amount-desc') return Number(BigInt(right.amount) - BigInt(left.amount));
        if (sortBy === 'amount-asc') return Number(BigInt(left.amount) - BigInt(right.amount));
        if (sortBy === 'oldest') return dateValue(left.receivedAt) - dateValue(right.receivedAt);
        return dateValue(right.receivedAt) - dateValue(left.receivedAt);
      });
  }, [directionFilter, events, query, sortBy]);

  const visibleRows = mode === 'withdrawals' ? filteredWithdrawals : filteredEvents;
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pageRows = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const requestConfirmation = (label: string, actionReason: string, task: () => Promise<unknown>) => {
    if (!actionReason.trim()) { setMessage('Nhập lý do trước khi xác nhận thao tác này.'); return; }
    setPending({ label, reason: actionReason.trim(), task });
  };

  const confirm = async () => {
    if (!pending) return;
    try {
      await pending.task();
      setMessage('Đã xử lý và ghi audit.');
      setPending(null);
      setWithdrawalAction(null);
      await reload();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const filterBar = 'grid gap-2 lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem]';
  const content = mode === 'withdrawals' ? (
    <section className="grid gap-3">
      <div className={filterBar}>
        <TextInput aria-label="Tìm yêu cầu rút" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mã CK, người yêu cầu, ngân hàng, số TK…" />
        <SelectInput aria-label="Lọc trạng thái yêu cầu rút" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="pending">Chờ đối soát chi</option><option value="partially_paid">Đã chi một phần</option><option value="paid">Đã chi</option><option value="rejected">Đã từ chối</option></SelectInput>
        <SelectInput aria-label="Sắp xếp yêu cầu rút" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="newest">Mới nhất trước</option><option value="oldest">Cũ nhất trước</option><option value="amount-desc">Số tiền cao → thấp</option><option value="amount-asc">Số tiền thấp → cao</option></SelectInput>
      </div>
      <p className="text-xs text-ink-500">{filteredWithdrawals.length} / {withdrawals.length} yêu cầu · Chuyển khoản đúng nội dung CK, giao dịch ngân hàng về sẽ được gán ở tab Đối soát.</p>
      {pageRows.length === 0 ? <EmptyState title="Không có yêu cầu phù hợp" description="Thử thay đổi từ khóa, trạng thái hoặc cách sắp xếp." /> : <div className="surface-card overflow-hidden">
        <div className="hidden grid-cols-[1.2fr_1.2fr_1.3fr_0.9fr_0.9fr_14rem] gap-3 bg-canvas px-4 py-3 text-xs font-bold uppercase tracking-wide text-ink-500 lg:grid"><span>Mã CK</span><span>Người yêu cầu</span><span>Tài khoản nhận</span><span className="text-right">Số tiền</span><span>Trạng thái</span><span /></div>
        {(pageRows as WithdrawalRow[]).map((row) => {
          const paid = BigInt(row.paidAmount); const identity = accountIdentities.get(row.sellerUserId);
          const cancelledByOwner = row.status === 'rejected' && row.rejectionReason === 'Chủ ví hủy yêu cầu.';
          return <article className={`grid items-center gap-3 border-t border-line px-4 py-3 text-sm first-of-type:border-t-0 lg:grid-cols-[1.2fr_1.2fr_1.3fr_0.9fr_0.9fr_14rem] ${row.id === focusId ? 'bg-green-50 ring-2 ring-inset ring-brand-navy/30' : ''}`} key={row.id}>
            <div><p className="text-figures font-bold text-brand-navy">{row.transferCode}</p><p className="text-xs text-ink-500">{row.walletType === 'personal' ? 'Ví người chơi' : 'Ví chủ sân'} · {row.createdAt ? formatDateTimeVi(row.createdAt) : '—'}</p></div>
            <div><p className="font-semibold text-ink-900">{identity?.displayName || identity?.email || 'Không tìm thấy tài khoản'}</p><p className="text-figures text-xs text-ink-500">{identity?.businessCode ?? '—'}</p></div>
            <div><p className="text-ink-900">{row.bankCode} · {row.bankAccountNumber}</p><p className="text-xs text-ink-500">{row.bankAccountName}</p></div>
            <div className="lg:text-right"><p className="text-figures font-bold text-ink-900">{formatMoneyVnd(row.amount)}</p>{paid > 0n && paid < BigInt(row.amount) ? <p className="text-xs text-ink-500">đã chi {formatMoneyVnd(row.paidAmount)}</p> : null}</div>
            <div><Badge tone={cancelledByOwner ? 'neutral' : withdrawalStatusTone(row.status)}>{cancelledByOwner ? 'Đã hủy' : withdrawalStatusLabel(row.status)}</Badge>{row.rejectionReason && !cancelledByOwner ? <p className="mt-1 text-xs text-danger">{row.rejectionReason}</p> : null}</div>
            <div className="flex flex-wrap justify-end gap-1.5">{(row.status === 'pending' || row.status === 'partially_paid') && withdrawalAction?.id !== row.id ? <>
              <Button tone="secondary" size="sm" aria-label={`Hiển thị mã QR ${row.transferCode}`} onClick={() => setQrWithdrawal(row)}>QR</Button>
              <Button tone="secondary" size="sm" aria-label={`Đã chuyển tiền ${row.transferCode}`} onClick={() => setWithdrawalAction({ id: row.id, kind: 'manual' })}>Đã chuyển</Button>
              {row.status === 'pending' ? <Button tone="ghost" size="sm" className="text-danger" onClick={() => setWithdrawalAction({ id: row.id, kind: 'reject' })}>Từ chối</Button> : null}
              {row.status === 'partially_paid' ? <Button tone="ghost" size="sm" className="text-danger" onClick={() => setWithdrawalAction({ id: row.id, kind: 'finalize' })}>Chốt mức đã chi</Button> : null}
            </> : null}</div>
            {withdrawalAction?.id === row.id ? <div className="flex flex-wrap items-end gap-2 rounded-xl bg-canvas p-3 lg:col-span-6"><label className="grid min-w-64 flex-1 gap-1 text-sm font-medium">{withdrawalAction.kind === 'reject' ? 'Lý do từ chối' : withdrawalAction.kind === 'manual' ? 'Mã tham chiếu/lý do chi' : 'Lý do chốt mức đã chi'}<TextInput aria-label={`${withdrawalAction.kind === 'reject' ? 'Lý do từ chối' : withdrawalAction.kind === 'manual' ? 'Mã tham chiếu/lý do chi' : 'Lý do chốt mức đã chi'} ${row.transferCode}`} value={withdrawalReasons[row.id] ?? ''} onChange={(event) => setWithdrawalReasons({ ...withdrawalReasons, [row.id]: event.target.value })} placeholder="Bắt buộc trước khi xác nhận" autoFocus /></label><Button tone="ghost" size="sm" onClick={() => setWithdrawalAction(null)}>Hủy</Button><Button tone={withdrawalAction.kind === 'reject' ? 'danger' : 'primary'} size="sm" onClick={() => requestConfirmation(withdrawalAction.kind === 'reject' ? 'Từ chối yêu cầu rút tiền' : withdrawalAction.kind === 'manual' ? 'Ghi nhận đã chuyển tiền ngoài SePay' : 'Chốt mức đã chi', withdrawalReasons[row.id] ?? '', () => withdrawalAction.kind === 'reject' ? rejectWithdrawal(row.id, withdrawalReasons[row.id] ?? '') : withdrawalAction.kind === 'manual' ? confirmManualWithdrawalPayout(row.id, withdrawalReasons[row.id] ?? '') : finalizePartialWithdrawal(row.id, withdrawalReasons[row.id] ?? ''))}>{withdrawalAction.kind === 'reject' ? 'Xác nhận từ chối' : withdrawalAction.kind === 'manual' ? 'Xác nhận đã chuyển tiền' : 'Xác nhận chốt mức đã chi'}</Button></div> : null}
          </article>;
        })}
      </div>}
      {pageCount > 1 ? <Pagination page={page} pageCount={pageCount} onChange={setPage} /> : null}
    </section>
  ) : (
    <section className="grid gap-3">
      <div className={filterBar}>
        <TextInput aria-label="Tìm giao dịch đối soát" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nội dung hoặc mã giao dịch…" />
        <SelectInput aria-label="Lọc hướng tiền" value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)}><option value="all">Tất cả hướng tiền</option><option value="in">Tiền vào</option><option value="out">Tiền ra</option></SelectInput>
        <SelectInput aria-label="Sắp xếp giao dịch đối soát" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="newest">Mới nhất trước</option><option value="oldest">Cũ nhất trước</option><option value="amount-desc">Số tiền cao → thấp</option><option value="amount-asc">Số tiền thấp → cao</option></SelectInput>
      </div>
      <p className="text-xs text-ink-500">{filteredEvents.length} / {events.length} giao dịch ngân hàng chưa gán · mọi đồng tiền phải có đối ứng.</p>
      {pageRows.length === 0 ? <EmptyState title="Không có giao dịch phù hợp" description="Thử thay đổi từ khóa, hướng tiền hoặc cách sắp xếp." /> : <div className="surface-card overflow-hidden">
        <div className="hidden grid-cols-[1.5fr_0.7fr_1fr_0.8fr_19rem] gap-3 bg-canvas px-4 py-3 text-xs font-bold uppercase tracking-wide text-ink-500 lg:grid"><span>Giao dịch</span><span>Hướng</span><span>Nhận lúc</span><span className="text-right">Số tiền</span><span /></div>
        {(pageRows as ReconciliationRow[]).map((event) => {
          const action = reconciliationAction?.id === event.id ? reconciliationAction : null;
          const reasonForEvent = reconciliationReasons[event.id] ?? '';
          const matchingWithdrawals = withdrawals.filter((row) => (row.status === 'pending' || row.status === 'partially_paid') && BigInt(row.amount) - BigInt(row.paidAmount) === BigInt(event.amount));
          const submit = () => action?.kind === 'incoming'
            ? requestConfirmation('Gán giao dịch vào ví cá nhân', reasonForEvent, () => reconcileIncoming(event.id, reconciliationTargets[event.id] ?? '', reasonForEvent))
            : action?.kind === 'outgoing'
              ? requestConfirmation('Gán giao dịch vào yêu cầu rút', reasonForEvent, () => reconcileOutgoing(event.id, reconciliationTargets[event.id] ?? '', reasonForEvent))
              : requestConfirmation('Đánh dấu giao dịch ngoài phạm vi', reasonForEvent, () => markOutOfScope(event.id, reasonForEvent));
          const needsTarget = action?.kind === 'incoming' || action?.kind === 'outgoing';
          return <article className="grid items-center gap-3 border-t border-line px-4 py-3 text-sm first-of-type:border-t-0 lg:grid-cols-[1.5fr_0.7fr_1fr_0.8fr_19rem]" key={event.id}>
            <div><BusinessCode code={event.businessCode} label="Mã giao dịch" /><details className="text-xs text-ink-500"><summary className="cursor-pointer font-medium">Xem tham chiếu đối soát</summary><code className="mt-1 block break-all rounded-lg bg-canvas p-2">{event.rawRef || 'Không có nội dung chuyển khoản'}</code></details></div>
            <div><Badge tone={event.direction === 'in' ? 'success' : 'warning'}>{event.direction === 'in' ? 'Tiền vào' : 'Tiền ra'}</Badge></div>
            <p className="text-ink-700">{formatDateTimeVi(event.receivedAt)}</p>
            <p className="text-figures font-bold text-ink-900 lg:text-right">{formatMoneyVnd(event.amount)}</p>
            <div className="flex justify-end gap-1.5 whitespace-nowrap">{!action ? <>{event.direction === 'in' ? <Button tone="secondary" size="sm" onClick={() => setReconciliationAction({ id: event.id, kind: 'incoming' })}>Gán ví cá nhân</Button> : <Button tone="secondary" size="sm" onClick={() => setReconciliationAction({ id: event.id, kind: 'outgoing' })}>Gán yêu cầu rút</Button>}<Button tone="ghost" size="sm" onClick={() => setReconciliationAction({ id: event.id, kind: 'outOfScope' })}>Ngoài phạm vi</Button></> : null}</div>
            {action ? <div className="grid gap-2 rounded-xl bg-canvas p-3 lg:col-span-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              {action.kind === 'incoming' ? <div className="grid gap-1 text-sm font-medium">Chọn người nhận<TextInput aria-label={`Tìm người nhận ${event.id}`} value={recipientQuery} onChange={(input) => setRecipientQuery(input.target.value)} placeholder="Email, tên hoặc mã ND-…" /><SelectInput aria-label={`Chọn người nhận ${event.id}`} value={reconciliationTargets[event.id] ?? ''} onChange={(input) => setReconciliationTargets({ ...reconciliationTargets, [event.id]: input.target.value })}><option value="">{recipientResults === null ? 'Chọn tài khoản' : recipientResults.length ? `${recipientResults.length} tài khoản khớp` : 'Không tìm thấy tài khoản'}</option>{(recipientResults ?? [...accountIdentities.values()]).map((identity) => <option key={identity.id} value={identity.id}>{identity.displayName || identity.email}{identity.businessCode ? ` · ${identity.businessCode}` : ''}{identity.displayName ? ` · ${identity.email}` : ''}</option>)}</SelectInput></div> : null}
              {action.kind === 'outgoing' ? <label className="grid gap-1 text-sm font-medium">Chọn yêu cầu rút tiền<SelectInput aria-label={`Chọn yêu cầu rút ${event.id}`} value={reconciliationTargets[event.id] ?? ''} onChange={(input) => setReconciliationTargets({ ...reconciliationTargets, [event.id]: input.target.value })}><option value="">Chọn yêu cầu rút phù hợp</option>{matchingWithdrawals.map((row) => <option key={row.id} value={row.id}>{row.transferCode} · {accountIdentities.get(row.sellerUserId)?.displayName || accountIdentities.get(row.sellerUserId)?.email || row.bankAccountName} · {formatMoneyVnd(BigInt(row.amount) - BigInt(row.paidAmount))}</option>)}</SelectInput>{matchingWithdrawals.length === 0 ? <span className="text-xs text-danger">Không có yêu cầu rút đang chờ có số tiền khớp.</span> : null}</label> : null}
              <label className={`grid gap-1 text-sm font-medium ${action.kind === 'outOfScope' ? 'lg:col-span-2' : ''}`}>Lý do đối soát *<TextInput aria-label={`Lý do đối soát ${event.id}`} value={reasonForEvent} onChange={(input) => setReconciliationReasons({ ...reconciliationReasons, [event.id]: input.target.value })} placeholder="Bắt buộc trước khi xác nhận" autoFocus /></label>
              <div className="flex gap-2"><Button tone="ghost" size="sm" onClick={() => setReconciliationAction(null)}>Hủy</Button><Button size="sm" disabled={needsTarget && !reconciliationTargets[event.id]} onClick={submit}>{action.kind === 'incoming' ? 'Xác nhận gán ví cá nhân' : action.kind === 'outgoing' ? 'Xác nhận gán yêu cầu rút' : 'Xác nhận ngoài phạm vi'}</Button></div>
            </div> : null}
          </article>;
        })}
      </div>}
      {pageCount > 1 ? <Pagination page={page} pageCount={pageCount} onChange={setPage} /> : null}
    </section>
  );

  return <>{content}{message && <p role="status" className="mt-3 rounded-xl bg-canvas p-3 text-sm text-ink-700">{message}</p>}<Modal open={Boolean(qrWithdrawal)} title="Quét QR chuyển tiền" onClose={() => setQrWithdrawal(null)}>{qrWithdrawal ? <div className="space-y-3"><SepayPayBox payment={withdrawalQr(qrWithdrawal)} /><p className="rounded-lg bg-warning-bg p-3 text-sm text-ink-700">Quét QR chỉ điền sẵn thông tin chuyển tiền. Yêu cầu chỉ được xác nhận sau khi SePay nhận webhook tiền ra khớp đúng số tiền và nội dung.</p></div> : null}</Modal><Modal open={Boolean(pending)} title="Xác nhận thao tác không thể đảo ngược" onClose={() => setPending(null)}><p className="text-sm text-ink-500">{pending?.label}. Lý do sẽ được lưu cùng audit: <strong className="text-ink-900">{pending?.reason}</strong></p><div className="mt-5 flex justify-end gap-2"><Button tone="secondary" onClick={() => setPending(null)}>Hủy</Button><Button tone="danger" onClick={() => void confirm()}>Xác nhận</Button></div></Modal></>;
}
