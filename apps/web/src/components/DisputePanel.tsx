import { useEffect, useState } from 'react';
import {
  createDispute, getEligibleDisputeBookings, getMyDisputes,
  type DisputeEligibleRow, type DisputeRow,
} from '../lib/financeApi';

const money = (value: string) => `${BigInt(value).toLocaleString('vi-VN')}đ`;

export function DisputePanel() {
  const [eligible, setEligible] = useState<DisputeEligibleRow[]>([]);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [bookingId, setBookingId] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [message, setMessage] = useState('');
  const reload = () => Promise.all([getEligibleDisputeBookings(), getMyDisputes()])
    .then(([nextEligible, nextDisputes]) => {
      setEligible(nextEligible); setDisputes(nextDisputes);
      setBookingId((current) => current || nextEligible[0]?.bookingId || '');
    }).catch((error: Error) => setMessage(error.message));
  useEffect(() => { reload(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createDispute({ bookingId, reason, evidence: evidence.split('\n').map((row) => row.trim()).filter(Boolean) });
      setReason(''); setEvidence(''); setMessage('Đã gửi tranh chấp và giữ doanh thu booking để Admin xem xét.');
      await reload();
    } catch (error) { setMessage((error as Error).message); }
  }

  return (
    <section className="mt-10" aria-labelledby="dispute-title">
      <h2 id="dispute-title" className="text-h2 mb-4 text-xl">Gửi tranh chấp</h2>
      <p className="mb-3 text-sm text-text-primary/60">Chỉ booking đã kết thúc và còn trong cửa sổ 24 giờ mới đủ điều kiện.</p>
      <form onSubmit={submit} className="grid gap-3 rounded-2xl bg-bg-white p-4">
        <select aria-label="Booking cần tranh chấp" value={bookingId} onChange={(event) => setBookingId(event.target.value)} required>
          <option value="">Chọn booking đủ điều kiện</option>
          {eligible.map((row) => <option key={row.bookingId} value={row.bookingId}>{row.bookingId} · {money(row.gross)} · hạn {new Date(row.deadlineAt).toLocaleString('vi-VN')}</option>)}
        </select>
        <textarea aria-label="Lý do tranh chấp" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do bắt buộc" required />
        <textarea aria-label="Bằng chứng" value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Bằng chứng — mỗi URL một dòng" />
        <button type="submit" className="w-fit rounded-full bg-primary-navy px-4 py-2 text-on-dark">Gửi tranh chấp</button>
      </form>
      <h3 className="mt-5 font-semibold">Tranh chấp của tôi</h3>
      <div className="mt-2 space-y-2">{disputes.map((row) => <div key={row.id} className="rounded-xl bg-bg-white p-3">
        <p>{row.bookingId} · {row.status === 'open' ? 'Đang xử lý' : row.resolution}</p>
        <p className="text-sm text-text-primary/60">{row.reason}{row.resolutionAmount ? ` · Hoàn ${money(row.resolutionAmount)}` : ''}</p>
      </div>)}</div>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </section>
  );
}
