import { useEffect, useState } from 'react';
import { getAdminDisputes, resolveDispute, type DisputeRow } from '../lib/financeApi';

const money = (value: string) => `${BigInt(value).toLocaleString('vi-VN')}đ`;

function DisputeDecisionCard({ row, onDecide }: {
  row: DisputeRow;
  onDecide: (id: string, decision: 'full_refund' | 'partial_refund' | 'rejected', amount: string, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  return <article className="rounded-xl bg-bg-white p-4">
    <p>{row.bookingId} · {row.status} · hạn {new Date(row.deadlineAt).toLocaleString('vi-VN')}</p>
    <p className="text-sm">{row.reason}</p>
    {row.revenue && <p className="text-sm">Booking: gộp {money(row.revenue.gross)} · ròng còn lại {money(row.revenue.net)} · hoa hồng còn lại {money(row.revenue.commission)}</p>}
    {row.evidence?.length > 0 && <ul className="text-sm">{row.evidence.map((item) => <li key={item}>{item}</li>)}</ul>}
    {row.ledgerEntries && row.ledgerEntries.length > 0 && <details className="mt-2 text-sm"><summary>Lịch sử bút toán</summary><ul>{row.ledgerEntries.map((entry) => <li key={entry.id}>{entry.type} · {entry.wallet.walletType} · {money(entry.amount)} · {entry.before} → {entry.after}</li>)}</ul></details>}
    {row.status === 'open' && <div className="mt-3 grid gap-2">
      <input aria-label={`Số tiền hoàn một phần ${row.bookingId}`} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Số tiền hoàn một phần" />
      <input aria-label={`Lý do quyết định ${row.bookingId}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do bắt buộc" />
      <div className="flex flex-wrap gap-3">
        <button onClick={() => onDecide(row.id, 'full_refund', amount, reason)}>Hoàn toàn bộ</button>
        <button onClick={() => onDecide(row.id, 'partial_refund', amount, reason)}>Hoàn một phần</button>
        <button onClick={() => onDecide(row.id, 'rejected', amount, reason)}>Bác tranh chấp</button>
      </div>
    </div>}
    {row.resolutionAmount && <p className="text-sm">Đã hoàn {money(row.resolutionAmount)}</p>}
  </article>;
}

export function DisputeAdminPanel() {
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [message, setMessage] = useState('');
  const reload = () => getAdminDisputes().then(setRows).catch((error: Error) => setMessage(error.message));
  useEffect(() => { reload(); }, []);
  const decide = async (id: string, decision: 'full_refund' | 'partial_refund' | 'rejected', amount: string, reason: string) => {
    try {
      await resolveDispute(id, { decision, ...(decision === 'partial_refund' ? { amount } : {}), reason });
      setMessage('Đã giải quyết tranh chấp, điều chỉnh tiền và ghi audit.');
      await reload();
    } catch (error) { setMessage((error as Error).message); }
  };

  return (
    <section>
      <p className="mb-3 text-sm">Chọn Hoàn toàn bộ, Hoàn một phần hoặc Bác tranh chấp. Mọi quyết định bắt buộc có lý do; hoàn tiền luôn đảo đủ ba vế.</p>
      <div className="space-y-2">{rows.map((row) => <DisputeDecisionCard key={row.id} row={row} onDecide={decide} />)}</div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
