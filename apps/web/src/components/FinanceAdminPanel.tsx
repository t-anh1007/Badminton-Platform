import { useEffect, useState } from 'react';
import { finalizePartialWithdrawal, getAdminWithdrawals, getReconciliationQueue, markOutOfScope, reconcileIncoming, reconcileOutgoing, rejectWithdrawal, type ReconciliationRow, type WithdrawalRow } from '../lib/financeApi';
import { Button, Modal, TextInput } from './ui';

type PendingAction = { label: string; task: () => Promise<unknown> };

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
      <p className="mb-3 text-sm text-ink-500">Từ chối bắt buộc có lý do; yêu cầu đã payout không thể hoàn tác.</p>
      <label className="grid max-w-lg gap-1.5 text-sm font-medium">Lý do xử lý tiền<TextInput aria-label="Lý do xử lý tiền" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do bắt buộc" /></label>
      <div className="mt-4 space-y-3">{withdrawals.map((row) => <article className="rounded-xl border border-line bg-surface p-4" key={row.id}><p className="font-medium">{row.transferCode} · {BigInt(row.amount).toLocaleString('vi-VN')}đ · {row.status}</p><p className="mt-1 text-sm text-ink-500">{row.bankCode} · {row.bankAccountNumber} · {row.bankAccountName}</p>{row.status === 'pending' && <Button tone="danger" size="sm" className="mt-3" onClick={() => requestConfirmation('Từ chối yêu cầu rút tiền', () => rejectWithdrawal(row.id, reason))}>Từ chối</Button>}{row.status === 'partially_paid' && <Button tone="danger" size="sm" className="mt-3" onClick={() => requestConfirmation('Chốt mức đã chi', () => finalizePartialWithdrawal(row.id, reason))}>Chốt mức đã chi</Button>}</article>)}</div>
    </section>
  ) : (
    <section>
      <p className="mb-3 text-sm text-ink-500">Hàng chờ đối soát — mọi đồng tiền phải có đối ứng.</p>
      <div className="grid gap-2 sm:grid-cols-2"><TextInput aria-label="Đối tượng gán" value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="User ID hoặc Withdrawal ID" /><TextInput aria-label="Lý do đối soát" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do bắt buộc" /></div>
      <div className="mt-4 space-y-3">{events.map((event) => <article className="rounded-xl border border-line bg-surface p-4" key={event.id}><p className="font-medium">{event.direction === 'in' ? 'Tiền vào' : 'Tiền ra'} · {BigInt(event.amount).toLocaleString('vi-VN')}đ · {event.rawRef}</p><div className="mt-3 flex flex-wrap gap-3">{event.direction === 'in' ? <Button size="sm" onClick={() => requestConfirmation('Gán giao dịch vào ví cá nhân', () => reconcileIncoming(event.id, targetId, reason))}>Gán ví cá nhân</Button> : <Button size="sm" onClick={() => requestConfirmation('Gán giao dịch vào yêu cầu rút', () => reconcileOutgoing(event.id, targetId, reason))}>Gán yêu cầu rút</Button>}<Button tone="danger" size="sm" onClick={() => requestConfirmation('Đánh dấu giao dịch ngoài phạm vi', () => markOutOfScope(event.id, reason))}>Ngoài phạm vi</Button></div></article>)}</div>
    </section>
  );

  return <>{content}{message && <p role="status" className="mt-4 text-sm text-ink-500">{message}</p>}<Modal open={Boolean(pending)} title="Xác nhận thao tác không thể đảo ngược" onClose={() => setPending(null)}><p className="text-sm text-ink-500">{pending?.label}. Lý do sẽ được lưu cùng audit: <strong className="text-ink-900">{reason}</strong></p><Button tone="danger" className="mt-5" onClick={() => void confirm()}>Xác nhận</Button></Modal></>;
}
