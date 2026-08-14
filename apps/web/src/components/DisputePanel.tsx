import { useEffect, useState } from 'react';
import {
  createDispute, getEligibleDisputeBookings, getMyDisputes,
  type DisputeEligibleRow, type DisputeRow,
} from '../lib/financeApi';
import { Button, SelectInput, SurfaceCard, TextArea } from './ui';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';

const money = formatMoneyVnd;

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
      <p className="mb-3 text-sm text-ink-900/60">Chỉ booking đã kết thúc và còn trong cửa sổ 24 giờ mới đủ điều kiện.</p>
      <SurfaceCard><form onSubmit={submit} className="grid gap-3">
        <SelectInput aria-label="Booking cần tranh chấp" value={bookingId} onChange={(event) => setBookingId(event.target.value)} required>
          <option value="">Chọn booking đủ điều kiện</option>
          {eligible.map((row) => <option key={row.bookingId} value={row.bookingId}>Ca kết thúc {formatDateTimeVi(row.endAt)} · {money(row.gross)} · hạn {formatDateTimeVi(row.deadlineAt)}</option>)}
        </SelectInput>
        <TextArea aria-label="Lý do tranh chấp" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do bắt buộc" required />
        <TextArea aria-label="Bằng chứng" value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Bằng chứng — mỗi URL một dòng" />
        <Button type="submit" className="w-fit">Gửi tranh chấp</Button>
      </form></SurfaceCard>
      <h3 className="mt-5 font-semibold">Tranh chấp của tôi</h3>
      <div className="mt-2 space-y-2">{disputes.map((row) => <div key={row.id} className="rounded-xl border border-line bg-surface p-3">
        <p>Tranh chấp gửi {formatDateTimeVi(row.createdAt)} · {row.status === 'open' ? 'Đang xử lý' : row.resolution}</p>
        <p className="text-sm text-ink-900/60">{row.reason}{row.resolutionAmount ? ` · Hoàn ${money(row.resolutionAmount)}` : ''}</p>
      </div>)}</div>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </section>
  );
}
