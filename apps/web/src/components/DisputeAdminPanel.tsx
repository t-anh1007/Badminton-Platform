import { useEffect, useState } from 'react';
import { getAdminDisputes, resolveDispute, type DisputeRow } from '../lib/financeApi';
import { Button, Modal, TextInput } from './ui';
import { formatDateTimeVi } from '../lib/formatters.js';

const money = (value: string) => `${BigInt(value).toLocaleString('vi-VN')}đ`;
type Decision = 'full_refund' | 'partial_refund' | 'rejected';
type PendingDecision = { id: string; decision: Decision; amount: string; reason: string };

function DisputeDecisionCard({ row, onRequestDecision }: { row: DisputeRow; onRequestDecision: (decision: PendingDecision) => void }) {
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  return <article className="rounded-xl border border-line bg-surface p-4"><p className="font-medium">Tranh chấp đặt sân · {row.status === 'open' ? 'Đang xử lý' : 'Đã giải quyết'} · hạn {formatDateTimeVi(row.deadlineAt)}</p><p className="mt-1 text-sm text-ink-500">{row.reason}</p>{row.revenue && <p className="mt-2 text-sm text-ink-500">Booking: gộp {money(row.revenue.gross)} · ròng {money(row.revenue.net)} · hoa hồng {money(row.revenue.commission)}</p>}{row.evidence?.length > 0 && <ul className="mt-2 text-sm text-ink-500">{row.evidence.map((item) => <li key={item}>{item}</li>)}</ul>}{row.ledgerEntries?.length ? <details className="mt-2 text-sm"><summary>Lịch sử bút toán</summary><ul>{row.ledgerEntries.map((entry) => <li key={entry.id}>{entry.type} · {entry.wallet.walletType} · {money(entry.amount)} · {entry.before} → {entry.after}</li>)}</ul></details> : null}{row.status === 'open' && <div className="mt-4 grid gap-2"><TextInput aria-label="Số tiền hoàn một phần cho tranh chấp" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Số tiền hoàn một phần" /><TextInput aria-label="Lý do quyết định tranh chấp" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do bắt buộc" /><div className="flex flex-wrap gap-3"><Button size="sm" onClick={() => onRequestDecision({ id: row.id, decision: 'full_refund', amount, reason })}>Hoàn toàn bộ</Button><Button size="sm" onClick={() => onRequestDecision({ id: row.id, decision: 'partial_refund', amount, reason })}>Hoàn một phần</Button><Button tone="danger" size="sm" onClick={() => onRequestDecision({ id: row.id, decision: 'rejected', amount, reason })}>Bác tranh chấp</Button></div></div>}{row.resolutionAmount && <p className="mt-2 text-sm text-ink-500">Đã hoàn {money(row.resolutionAmount)}</p>}</article>;
}

export function DisputeAdminPanel() {
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const reload = () => getAdminDisputes().then(setRows).catch((error: Error) => setMessage(error.message));
  useEffect(() => { void reload(); }, []);
  const requestDecision = (decision: PendingDecision) => {
    if (!decision.reason.trim()) { setMessage('Nhập lý do trước khi xác nhận quyết định.'); return; }
    if (decision.decision === 'partial_refund' && !/^\d+$/.test(decision.amount)) { setMessage('Nhập số tiền hoàn một phần hợp lệ.'); return; }
    setPending(decision);
  };
  const decide = async () => {
    if (!pending) return;
    try {
      await resolveDispute(pending.id, { decision: pending.decision, ...(pending.decision === 'partial_refund' ? { amount: pending.amount } : {}), reason: pending.reason });
      setMessage('Đã giải quyết tranh chấp, điều chỉnh tiền và ghi audit.');
      setPending(null);
      await reload();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const decisionLabel = pending?.decision === 'full_refund' ? 'Hoàn toàn bộ' : pending?.decision === 'partial_refund' ? 'Hoàn một phần' : 'Bác tranh chấp';
  return <section><p className="mb-3 text-sm text-ink-500">Mọi quyết định cần lý do và xác nhận; hoàn tiền luôn đảo đủ ba vế.</p><div className="space-y-3">{rows.map((row) => <DisputeDecisionCard key={row.id} row={row} onRequestDecision={requestDecision} />)}</div>{message && <p role="status" className="mt-4 text-sm text-ink-500">{message}</p>}<Modal open={Boolean(pending)} title="Xác nhận quyết định tranh chấp" onClose={() => setPending(null)}><p className="text-sm text-ink-500">{decisionLabel}. Lý do sẽ được lưu cùng audit: <strong className="text-ink-900">{pending?.reason}</strong></p><Button tone="danger" className="mt-5" onClick={() => void decide()}>Xác nhận</Button></Modal></section>;
}
