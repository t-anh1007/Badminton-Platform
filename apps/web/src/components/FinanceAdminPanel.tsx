import { useEffect, useState } from 'react';
import {
  finalizePartialWithdrawal, getAdminWithdrawals, getReconciliationQueue, markOutOfScope,
  reconcileIncoming, reconcileOutgoing, rejectWithdrawal, type ReconciliationRow, type WithdrawalRow,
} from '../lib/financeApi';

export function FinanceAdminPanel({ mode }: { mode: 'withdrawals' | 'reconciliation' }) {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [events, setEvents] = useState<ReconciliationRow[]>([]);
  const [reason, setReason] = useState('');
  const [targetId, setTargetId] = useState('');
  const [message, setMessage] = useState('');
  const reload = () => Promise.all([getAdminWithdrawals(), getReconciliationQueue()])
    .then(([nextWithdrawals, nextEvents]) => { setWithdrawals(nextWithdrawals); setEvents(nextEvents); })
    .catch((error: Error) => setMessage(error.message));
  useEffect(() => { reload(); }, []);
  const run = async (task: () => Promise<unknown>) => {
    try { await task(); setMessage('Đã xử lý và ghi audit.'); await reload(); } catch (error) { setMessage((error as Error).message); }
  };

  if (mode === 'withdrawals') return (
    <section><p className="mb-3 text-sm">Từ chối bắt buộc có lý do; yêu cầu đã payout không thể hoàn tác.</p>
      <input aria-label="Lý do xử lý tiền" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do bắt buộc" />
      <div className="mt-3 space-y-2">{withdrawals.map((row) => <div className="rounded-xl bg-surface p-4" key={row.id}>
        <p>{row.transferCode} · {BigInt(row.amount).toLocaleString('vi-VN')}đ · {row.status}</p>
        <p className="text-sm">{row.bankCode} · {row.bankAccountNumber} · {row.bankAccountName}</p>
        {row.status === 'pending' && <button onClick={() => run(() => rejectWithdrawal(row.id, reason))}>Từ chối</button>}
        {row.status === 'partially_paid' && <button onClick={() => run(() => finalizePartialWithdrawal(row.id, reason))}>Chốt mức đã chi</button>}
      </div>)}</div>{message && <p role="status">{message}</p>}
    </section>
  );

  return (
    <section><p className="mb-3 text-sm">Hàng chờ đối soát — mọi đồng tiền phải có đối ứng.</p>
      <div className="grid gap-2 sm:grid-cols-2"><input aria-label="Đối tượng gán" value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="User ID hoặc Withdrawal ID" /><input aria-label="Lý do đối soát" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do bắt buộc" /></div>
      <div className="mt-3 space-y-2">{events.map((event) => <div className="rounded-xl bg-surface p-4" key={event.id}>
        <p>{event.direction === 'in' ? 'Tiền vào' : 'Tiền ra'} · {BigInt(event.amount).toLocaleString('vi-VN')}đ · {event.rawRef}</p>
        <div className="flex gap-3">{event.direction === 'in' ? <button onClick={() => run(() => reconcileIncoming(event.id, targetId, reason))}>Gán ví cá nhân</button> : <button onClick={() => run(() => reconcileOutgoing(event.id, targetId, reason))}>Gán yêu cầu rút</button>}<button onClick={() => run(() => markOutOfScope(event.id, reason))}>Ngoài phạm vi</button></div>
      </div>)}</div>{message && <p role="status">{message}</p>}
    </section>
  );
}
