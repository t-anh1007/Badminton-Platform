import { useEffect, useMemo, useState } from 'react';
import { finalizePartialWithdrawal, getAdminWithdrawals, getReconciliationQueue, markOutOfScope, reconcileIncoming, reconcileOutgoing, rejectWithdrawal, type ReconciliationRow, type WithdrawalRow } from '../lib/financeApi';
import { getAdminAccountIdentities, type AdminAccountIdentity } from '../lib/accountApi';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';
import { Badge, Button, EmptyState, Modal, Pagination, SelectInput, TextInput } from './ui';

type PendingAction = { label: string; task: () => Promise<unknown> };
const shortReference = (value: string) => value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
const withdrawalStatusLabel = (status: string) => ({ pending: 'Chờ đối soát chi', partially_paid: 'Đã chi một phần', paid: 'Đã chi', rejected: 'Đã từ chối' } as Record<string, string>)[status] ?? status;
const withdrawalStatusTone = (status: string) => status === 'pending' || status === 'partially_paid' ? 'warning' : status === 'paid' ? 'success' : status === 'rejected' ? 'danger' : 'neutral';
const PAGE_SIZE = 10;
const dateValue = (value?: string | null) => value ? new Date(value).getTime() : 0;
const includesText = (values: Array<string | null | undefined>, query: string) => values.some((value) => value?.toLocaleLowerCase('vi').includes(query));

export function FinanceAdminPanel({ mode }: { mode: 'withdrawals' | 'reconciliation' }) {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [events, setEvents] = useState<ReconciliationRow[]>([]);
  const [reason, setReason] = useState('');
  const [targetId, setTargetId] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);
  const [accountIdentities, setAccountIdentities] = useState<Map<string, AdminAccountIdentity>>(() => new Map());

  const reload = async () => {
    try {
      if (mode === 'withdrawals') {
        const rows = await getAdminWithdrawals();
        setWithdrawals(rows);
        const identities = await getAdminAccountIdentities([...new Set(rows.map((row) => row.sellerUserId))]);
        setAccountIdentities(new Map(identities.map((identity) => [identity.id, identity])));
      } else {
        setEvents(await getReconciliationQueue());
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  useEffect(() => { void reload(); }, [mode]);

  useEffect(() => { setPage(1); }, [directionFilter, query, sortBy, statusFilter]);

  const filteredWithdrawals = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    return withdrawals
      .filter((row) => statusFilter === 'all' || row.status === statusFilter)
      .filter((row) => !normalizedQuery || includesText([row.transferCode, row.sellerUserId, row.bankCode, row.bankAccountNumber, row.bankAccountName], normalizedQuery))
      .toSorted((left, right) => {
        if (sortBy === 'amount-desc') return Number(BigInt(right.amount) - BigInt(left.amount));
        if (sortBy === 'amount-asc') return Number(BigInt(left.amount) - BigInt(right.amount));
        if (sortBy === 'oldest') return dateValue(left.createdAt) - dateValue(right.createdAt);
        return dateValue(right.createdAt) - dateValue(left.createdAt);
      });
  }, [query, sortBy, statusFilter, withdrawals]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    return events
      .filter((event) => directionFilter === 'all' || event.direction === directionFilter)
      .filter((event) => !normalizedQuery || includesText([event.rawRef, event.id], normalizedQuery))
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

  const requestConfirmation = (label: string, task: () => Promise<unknown>) => {
    if (!reason.trim()) { setMessage('Nhập lý do trước khi xác nhận thao tác này.'); return; }
    setPending({ label, task });
  };

  const confirm = async () => {
    if (!pending) return;
    try {
      await pending.task();
      setMessage('Đã xử lý và ghi audit.');
      setPending(null);
      await reload();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const content = mode === 'withdrawals' ? (
    <section>
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-info bg-info-bg p-3 text-sm text-ink-700">
        <span aria-hidden>ⓘ</span>
        <p><strong>Duyệt chi qua đối soát, không có nút chi tay.</strong> Sau khi chuyển khoản theo mã <em>Nội dung CK</em> bên dưới, giao dịch ngân hàng về sẽ được khớp ở tab <strong>Đối soát</strong> (nút “Gán yêu cầu rút”) — hệ thống tự chuyển yêu cầu sang <em>đã chi</em>. Ở đây chỉ <em>từ chối</em> hoặc <em>chốt mức đã chi</em> khi cần.</p>
      </div>
      <div className="grid gap-3 rounded-xl border border-line bg-canvas p-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_13rem]">
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Tìm yêu cầu<TextInput aria-label="Tìm yêu cầu rút" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mã CK, chủ sân, ngân hàng, số TK…" /></label>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Trạng thái<SelectInput aria-label="Lọc trạng thái yêu cầu rút" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="pending">Chờ đối soát chi</option><option value="partially_paid">Đã chi một phần</option><option value="paid">Đã chi</option><option value="rejected">Đã từ chối</option></SelectInput></label>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Sắp xếp<SelectInput aria-label="Sắp xếp yêu cầu rút" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="newest">Mới nhất trước</option><option value="oldest">Cũ nhất trước</option><option value="amount-desc">Số tiền cao → thấp</option><option value="amount-asc">Số tiền thấp → cao</option></SelectInput></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-ink-500">Hiển thị <strong className="text-ink-900">{filteredWithdrawals.length}</strong> / {withdrawals.length} yêu cầu</p><label className="grid min-w-64 gap-1 text-sm font-medium">Lý do xử lý tiền<TextInput aria-label="Lý do xử lý tiền" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Bắt buộc khi xử lý" /></label></div>
      {pageRows.length === 0 ? <div className="mt-4"><EmptyState title="Không có yêu cầu phù hợp" description="Thử thay đổi từ khóa, trạng thái hoặc cách sắp xếp." /></div> : <div className="mt-4 space-y-3">{(pageRows as WithdrawalRow[]).map((row) => {
        const amount = BigInt(row.amount); const paid = BigInt(row.paidAmount); const remaining = amount - paid; const identity = accountIdentities.get(row.sellerUserId);
        return <article className="rounded-xl border border-line bg-surface p-4 shadow-sm" key={row.id}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-500">Nội dung chuyển khoản</p><p className="mt-1 text-figures text-lg font-bold text-brand-navy">{row.transferCode}</p></div><Badge tone={withdrawalStatusTone(row.status)}>{withdrawalStatusLabel(row.status)}</Badge></div>
          <div className="mt-4 grid gap-4 border-y border-line py-4 sm:grid-cols-3"><div><p className="text-xs text-ink-500">Số tiền yêu cầu</p><p className="text-figures text-xl font-bold text-ink-900">{formatMoneyVnd(row.amount)}</p></div><div><p className="text-xs text-ink-500">Đã chi</p><p className="text-figures font-semibold text-ink-900">{formatMoneyVnd(row.paidAmount)}</p></div><div><p className="text-xs text-ink-500">Còn phải xử lý</p><p className="text-figures font-semibold text-ink-900">{formatMoneyVnd(remaining)}</p></div></div>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm md:grid-cols-2"><div><dt className="text-ink-500">Người yêu cầu</dt><dd className="font-medium text-ink-900">{identity?.displayName || identity?.email || 'Không tìm thấy tài khoản'}</dd>{identity?.email && identity.displayName ? <dd className="text-ink-500">{identity.email}</dd> : null}<dd className="font-mono text-xs text-ink-400" title={row.sellerUserId}>ID: {shortReference(row.sellerUserId)}</dd></div><div><dt className="text-ink-500">Tài khoản nhận</dt><dd className="font-medium text-ink-900">{row.bankCode} · {row.bankAccountNumber}<br />{row.bankAccountName}</dd></div><div><dt className="text-ink-500">Thời gian tạo</dt><dd className="text-ink-900">{row.createdAt ? formatDateTimeVi(row.createdAt) : 'Chưa có dữ liệu'}</dd></div><div><dt className="text-ink-500">Thời gian xử lý</dt><dd className="text-ink-900">{row.processedAt ? formatDateTimeVi(row.processedAt) : 'Chưa xử lý'}</dd></div>{row.rejectionReason ? <div className="md:col-span-2"><dt className="text-ink-500">Lý do từ chối</dt><dd className="text-danger">{row.rejectionReason}</dd></div> : null}</dl>
          {row.status === 'pending' ? <p className="mt-4 rounded-lg bg-warning-bg p-3 text-xs text-ink-700">Chuyển đúng <strong>{formatMoneyVnd(row.amount)}</strong> với nội dung <strong>{row.transferCode}</strong>, sau đó khớp giao dịch tại khu vực Đối soát.</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">{row.status === 'pending' ? <Button tone="danger" size="sm" onClick={() => requestConfirmation('Từ chối yêu cầu rút tiền', () => rejectWithdrawal(row.id, reason))}>Từ chối</Button> : null}{row.status === 'partially_paid' ? <Button tone="danger" size="sm" onClick={() => requestConfirmation('Chốt mức đã chi', () => finalizePartialWithdrawal(row.id, reason))}>Chốt mức đã chi</Button> : null}</div>
        </article>;
      })}</div>}
      {pageCount > 1 ? <div className="mt-5"><Pagination page={page} pageCount={pageCount} onChange={setPage} /></div> : null}
    </section>
  ) : (
    <section>
      <p className="mb-3 text-sm text-ink-500">Hàng chờ đối soát — mọi đồng tiền phải có đối ứng.</p>
      <div className="grid gap-3 rounded-xl border border-line bg-canvas p-3 lg:grid-cols-[minmax(14rem,1fr)_11rem_13rem]"><label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Tìm giao dịch<TextInput aria-label="Tìm giao dịch đối soát" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nội dung hoặc mã giao dịch…" /></label><label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Hướng tiền<SelectInput aria-label="Lọc hướng tiền" value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)}><option value="all">Tất cả</option><option value="in">Tiền vào</option><option value="out">Tiền ra</option></SelectInput></label><label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Sắp xếp<SelectInput aria-label="Sắp xếp giao dịch đối soát" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="newest">Mới nhất trước</option><option value="oldest">Cũ nhất trước</option><option value="amount-desc">Số tiền cao → thấp</option><option value="amount-asc">Số tiền thấp → cao</option></SelectInput></label></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2"><TextInput aria-label="Đối tượng gán" value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="User ID hoặc Withdrawal ID" /><TextInput aria-label="Lý do đối soát" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do bắt buộc" /></div>
      <p className="mt-3 text-sm text-ink-500">Hiển thị <strong className="text-ink-900">{filteredEvents.length}</strong> / {events.length} giao dịch</p>
      {pageRows.length === 0 ? <div className="mt-4"><EmptyState title="Không có giao dịch phù hợp" description="Thử thay đổi từ khóa, hướng tiền hoặc cách sắp xếp." /></div> : <div className="mt-4 grid gap-3 lg:grid-cols-2">{(pageRows as ReconciliationRow[]).map((event) => <article className="rounded-xl border border-line bg-surface p-4" key={event.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-ink-500">{event.direction === 'in' ? 'Tiền vào' : 'Tiền ra'}</p><p className="text-figures text-xl font-bold text-ink-900">{formatMoneyVnd(event.amount)}</p></div><Badge tone={event.direction === 'in' ? 'success' : 'warning'}>{event.direction === 'in' ? 'Tiền vào' : 'Tiền ra'}</Badge></div><p className="mt-3 text-sm text-ink-500">Nhận lúc <span className="text-ink-900">{formatDateTimeVi(event.receivedAt)}</span></p><details className="mt-2 text-xs text-ink-500"><summary className="cursor-pointer font-medium">Xem tham chiếu đối soát</summary><code className="mt-2 block break-all rounded-lg bg-canvas p-2">{event.rawRef || shortReference(event.id)}</code></details><div className="mt-4 flex flex-wrap gap-2">{event.direction === 'in' ? <Button size="sm" onClick={() => requestConfirmation('Gán giao dịch vào ví cá nhân', () => reconcileIncoming(event.id, targetId, reason))}>Gán ví cá nhân</Button> : <Button size="sm" onClick={() => requestConfirmation('Gán giao dịch vào yêu cầu rút', () => reconcileOutgoing(event.id, targetId, reason))}>Gán yêu cầu rút</Button>}<Button tone="danger" size="sm" onClick={() => requestConfirmation('Đánh dấu giao dịch ngoài phạm vi', () => markOutOfScope(event.id, reason))}>Ngoài phạm vi</Button></div></article>)}</div>}
      {pageCount > 1 ? <div className="mt-5"><Pagination page={page} pageCount={pageCount} onChange={setPage} /></div> : null}
    </section>
  );

  return <>{content}{message && <p role="status" className="mt-4 text-sm text-ink-500">{message}</p>}<Modal open={Boolean(pending)} title="Xác nhận thao tác không thể đảo ngược" onClose={() => setPending(null)}><p className="text-sm text-ink-500">{pending?.label}. Lý do sẽ được lưu cùng audit: <strong className="text-ink-900">{reason}</strong></p><Button tone="danger" className="mt-5" onClick={() => void confirm()}>Xác nhận</Button></Modal></>;
}
