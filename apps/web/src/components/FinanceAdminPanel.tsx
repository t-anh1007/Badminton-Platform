import { useEffect, useState } from 'react';
import { finalizePartialWithdrawal, getAdminWithdrawals, getReconciliationQueue, markOutOfScope, reconcileIncoming, reconcileOutgoing, rejectWithdrawal, type ReconciliationRow, type WithdrawalRow } from '../lib/financeApi';
import { Button, Modal, TextInput } from './ui';

type PendingAction = { label: string; task: () => Promise<unknown> };
const shortReference = (value: string) => value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
const withdrawalStatusLabel = (status: string) => ({ pending: 'Chờ đối soát chi', partially_paid: 'Đã chi một phần', paid: 'Đã chi', rejected: 'Đã từ chối' } as Record<string, string>)[status] ?? status;

export function FinanceAdminPanel({ mode }: { mode: 'withdrawals' | 'reconciliation' }) {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [events, setEvents] = useState<ReconciliationRow[]>([]);
  const [reason, setReason] = useState('');
  const [targetId, setTargetId] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);

  const reload = () => Promise.all([getAdminWithdrawals(), getReconciliationQueue()])
    .then(([nextWithdrawals, nextEvents]) => { setWithdrawals(nextWithdrawals); setEvents(nextEvents); })
    .catch((error: Error) => setMessage(error.message));

  useEffect(() => { void reload(); }, []);

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
      <label className="grid max-w-lg gap-1.5 text-sm font-medium">Lý do xử lý tiền<TextInput aria-label="Lý do xử lý tiền" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do bắt buộc" /></label>
      <div className="mt-4 space-y-3">{withdrawals.map((row) => <article className="rounded-xl border border-line bg-surface p-4" key={row.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{BigInt(row.amount).toLocaleString('vi-VN')}đ</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'pending' ? 'bg-warning-bg text-warning' : row.status === 'paid' ? 'bg-success-bg text-success' : 'bg-canvas text-ink-500'}`}>{withdrawalStatusLabel(row.status)}</span></div><dl className="mt-2 grid gap-1 text-sm text-ink-500"><div className="flex justify-between gap-3"><dt>Nội dung CK</dt><dd className="text-figures font-semibold text-ink-800">{row.transferCode}</dd></div><div className="flex justify-between gap-3"><dt>Tài khoản nhận</dt><dd>{row.bankCode} · {row.bankAccountNumber} · {row.bankAccountName}</dd></div>{BigInt(row.paidAmount) > 0n && <div className="flex justify-between gap-3"><dt>Đã chi</dt><dd>{BigInt(row.paidAmount).toLocaleString('vi-VN')}đ</dd></div>}</dl>{row.status === 'pending' && <p className="mt-3 text-xs text-ink-500">Chuyển khoản đúng nội dung trên, rồi khớp giao dịch ở tab Đối soát để hoàn tất chi.</p>}<div className="mt-3 flex gap-2">{row.status === 'pending' && <Button tone="danger" size="sm" onClick={() => requestConfirmation('Từ chối yêu cầu rút tiền', () => rejectWithdrawal(row.id, reason))}>Từ chối</Button>}{row.status === 'partially_paid' && <Button tone="danger" size="sm" onClick={() => requestConfirmation('Chốt mức đã chi', () => finalizePartialWithdrawal(row.id, reason))}>Chốt mức đã chi</Button>}</div></article>)}</div>
    </section>
  ) : (
    <section>
      <p className="mb-3 text-sm text-ink-500">Hàng chờ đối soát — mọi đồng tiền phải có đối ứng.</p>
      <div className="grid gap-2 sm:grid-cols-2"><TextInput aria-label="Đối tượng gán" value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="User ID hoặc Withdrawal ID" /><TextInput aria-label="Lý do đối soát" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do bắt buộc" /></div>
      <div className="mt-4 space-y-3">{events.map((event) => <article className="rounded-xl border border-line bg-surface p-4" key={event.id}><p className="font-medium">{event.direction === 'in' ? 'Tiền vào' : 'Tiền ra'} · {BigInt(event.amount).toLocaleString('vi-VN')}đ</p><p className="text-sm text-ink-500">Nhận lúc {new Date(event.receivedAt).toLocaleString('vi-VN')}</p><details className="mt-2 text-xs text-ink-500"><summary>Xem tham chiếu đối soát</summary><code>{shortReference(event.rawRef)}</code></details><div className="mt-3 flex flex-wrap gap-3">{event.direction === 'in' ? <Button size="sm" onClick={() => requestConfirmation('Gán giao dịch vào ví cá nhân', () => reconcileIncoming(event.id, targetId, reason))}>Gán ví cá nhân</Button> : <Button size="sm" onClick={() => requestConfirmation('Gán giao dịch vào yêu cầu rút', () => reconcileOutgoing(event.id, targetId, reason))}>Gán yêu cầu rút</Button>}<Button tone="danger" size="sm" onClick={() => requestConfirmation('Đánh dấu giao dịch ngoài phạm vi', () => markOutOfScope(event.id, reason))}>Ngoài phạm vi</Button></div></article>)}</div>
    </section>
  );

  return <>{content}{message && <p role="status" className="mt-4 text-sm text-ink-500">{message}</p>}<Modal open={Boolean(pending)} title="Xác nhận thao tác không thể đảo ngược" onClose={() => setPending(null)}><p className="text-sm text-ink-500">{pending?.label}. Lý do sẽ được lưu cùng audit: <strong className="text-ink-900">{reason}</strong></p><Button tone="danger" className="mt-5" onClick={() => void confirm()}>Xác nhận</Button></Modal></>;
}
