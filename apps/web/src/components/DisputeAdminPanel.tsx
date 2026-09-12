import { useEffect, useMemo, useState } from 'react';
import { getAdminDisputes, resolveDispute, type DisputeRow } from '../lib/financeApi';
import { Button, Modal, TextInput } from './ui';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';
import { useLiveDataRefresh } from '../realtime/dataInvalidation.js';

type Decision = 'full_refund' | 'partial_refund' | 'rejected';
const labels: Record<Decision, string> = { full_refund: 'Hoàn toàn bộ', partial_refund: 'Hoàn một phần', rejected: 'Bác tranh chấp' };
const isImage = (value: string) => /\.(jpe?g|png|webp)(\?|$)/i.test(value) || value.includes('/finance/disputes/');
const walletLabel = (walletType: string) => walletType === 'business' ? 'Ví chủ sân' : walletType === 'platform' ? 'Quỹ nền tảng' : 'Ví người chơi';
const ledgerLabel = (type: string, walletType: string) => {
  if (type === 'release') return 'Doanh thu được chuyển cho chủ sân';
  if (type === 'commission') return 'Phí dịch vụ được ghi nhận';
  if (type === 'refund') return walletType === 'personal' ? 'Hoàn tiền cho người chơi' : walletType === 'business' ? 'Điều chỉnh doanh thu chủ sân' : 'Điều chỉnh phí dịch vụ';
  if (type === 'payment') return 'Thanh toán booking';
  return 'Cập nhật số dư';
};

export function DisputeAdminPanel() {
  const [rows, setRows] = useState<DisputeRow[]>([]); const [selectedId, setSelectedId] = useState('');
  const [decision, setDecision] = useState<Decision | ''>(''); const [amount, setAmount] = useState(''); const [reason, setReason] = useState('');
  const [message, setMessage] = useState(''); const [confirming, setConfirming] = useState(false); const [busy, setBusy] = useState(false);
  const reload = () => getAdminDisputes().then((next) => { const sorted = [...next].sort((a, b) => a.status === b.status ? (a.status === 'open' ? +new Date(a.deadlineAt) - +new Date(b.deadlineAt) : +new Date(b.createdAt) - +new Date(a.createdAt)) : a.status === 'open' ? -1 : 1); setRows(sorted); setSelectedId((current) => sorted.some((row) => row.id === current) ? current : sorted[0]?.id ?? ''); }).catch((error: Error) => setMessage(error.message));
  useEffect(() => { void reload(); }, []);
  useLiveDataRefresh(reload);
  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId]);
  useEffect(() => { setDecision(''); setAmount(''); setReason(''); setConfirming(false); setMessage(''); }, [selectedId]);

  const requestConfirm = () => {
    if (!decision) return setMessage('Chọn một quyết định cho tranh chấp.');
    if (!reason.trim()) return setMessage('Nhập lý do trước khi xác nhận quyết định.');
    if (decision === 'partial_refund' && (!/^\d+$/.test(amount) || BigInt(amount) <= 0n || (selected?.revenue && BigInt(amount) > BigInt(selected.revenue.gross)))) return setMessage('Nhập số tiền hoàn hợp lệ, không vượt giá trị booking.');
    setMessage(''); setConfirming(true);
  };
  const decide = async () => {
    if (!selected || !decision) return; setBusy(true);
    try { await resolveDispute(selected.id, { decision, ...(decision === 'partial_refund' ? { amount } : {}), reason: reason.trim() }); setConfirming(false); setMessage('Đã giải quyết tranh chấp và cập nhật dòng tiền.'); await reload(); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };

  return <section>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink-500">Ưu tiên hồ sơ đang mở và gần hạn. Mọi quyết định đều cần lý do.</p><span className="rounded-full bg-brand-yellow px-3 py-1 text-xs font-bold text-brand-navy">{rows.filter((row) => row.status === 'open').length} đang chờ</span></div>
    {rows.length ? <div className="grid gap-4 lg:grid-cols-[minmax(16rem,.8fr)_minmax(0,1.7fr)]">
      <nav aria-label="Hàng đợi tranh chấp" className="max-h-[46rem] space-y-2 overflow-y-auto pr-1">{rows.map((row) => <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={`w-full rounded-2xl border p-4 text-left transition ${row.id === selectedId ? 'border-brand-navy bg-green-50 shadow-sm' : 'border-line bg-surface hover:border-brand-navy/40'}`}><div className="flex items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${row.status === 'open' ? 'bg-brand-yellow text-brand-navy' : 'bg-canvas text-ink-500'}`}>{row.status === 'open' ? 'Đang chờ' : 'Đã xử lý'}</span><span className="text-xs text-ink-500">{formatDateTimeVi(row.createdAt)}</span></div><p className="mt-3 line-clamp-2 font-semibold text-ink-900">{row.reason}</p>{row.revenue && <p className="mt-2 text-sm font-bold text-brand-navy">{formatMoneyVnd(row.revenue.gross)}</p>}</button>)}</nav>
      {selected && <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-caption text-ink-500">Hồ sơ tranh chấp</p><h3 className="mt-1 text-h2">{selected.status === 'open' ? 'Cần ra quyết định' : 'Đã giải quyết'}</h3></div><span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-brand-navy">Hạn {formatDateTimeVi(selected.deadlineAt)}</span></div>
        <div className="mt-5 grid gap-3 rounded-2xl bg-canvas p-4 sm:grid-cols-3"><div><p className="text-caption text-ink-500">Giá trị booking</p><strong className="text-figures text-brand-navy">{selected.revenue ? formatMoneyVnd(selected.revenue.gross) : '—'}</strong></div><div><p className="text-caption text-ink-500">Số liên hệ</p>{selected.contactPhone ? <a className="font-bold text-brand-navy underline decoration-brand-yellow decoration-2 underline-offset-4" href={`tel:${selected.contactPhone}`}>{selected.contactPhone}</a> : <span className="text-sm text-ink-500">Dữ liệu cũ không có</span>}</div><div><p className="text-caption text-ink-500">Trạng thái</p><strong>{selected.status === 'open' ? 'Đang xem xét' : labels[selected.resolution ?? 'rejected']}</strong></div></div>
        <section className="mt-5"><h4 className="font-bold text-brand-navy">Nội dung người chơi gửi</h4><p className="mt-2 text-sm leading-6 text-ink-700">{selected.reason}</p>{selected.evidence?.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{selected.evidence.map((item, index) => isImage(item) ? <a key={item} href={item} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-line"><img src={item} alt={`Bằng chứng ${index + 1}`} className="h-28 w-full object-cover" /></a> : <a key={item} href={item} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-navy underline">Bằng chứng {index + 1}</a>)}</div> : <p className="mt-2 text-sm text-ink-500">Không có ảnh bằng chứng.</p>}</section>
        {selected.ledgerEntries?.length ? <details className="mt-5 rounded-xl border border-line p-3 text-sm"><summary className="cursor-pointer font-bold text-brand-navy">Các thay đổi số dư liên quan ({selected.ledgerEntries.length})</summary><ul className="mt-3 space-y-3">{selected.ledgerEntries.map((entry) => <li key={entry.id} className="rounded-lg bg-canvas p-3"><p className="font-semibold text-ink-900">{ledgerLabel(entry.type, entry.wallet.walletType)}</p><p className="mt-1 text-ink-500">{walletLabel(entry.wallet.walletType)} · {formatMoneyVnd(entry.before)} → {formatMoneyVnd(entry.after)}</p></li>)}</ul></details> : null}
        {selected.status === 'open' ? <section className="mt-6 border-t border-line pt-5"><h4 className="font-bold text-brand-navy">Quyết định xử lý</h4><div className="mt-3 grid gap-2 sm:grid-cols-3">{(Object.keys(labels) as Decision[]).map((value) => <button key={value} type="button" role="radio" aria-checked={decision === value} onClick={() => setDecision(value)} className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-bold ${decision === value ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-surface text-brand-navy'}`}>{labels[value]}</button>)}</div>{decision === 'partial_refund' && <label className="mt-4 grid gap-2 text-sm font-bold text-brand-navy">Số tiền hoàn<TextInput aria-label="Số tiền hoàn một phần cho tranh chấp" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} placeholder="Ví dụ: 80000" /></label>}<label className="mt-4 grid gap-2 text-sm font-bold text-brand-navy">Lý do quyết định<TextInput aria-label="Lý do quyết định tranh chấp" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Nêu ngắn gọn căn cứ xử lý" /></label><Button className="mt-4" onClick={requestConfirm}>Xem lại & xác nhận</Button></section> : selected.resolutionAmount && <p className="mt-5 rounded-xl bg-green-50 p-3 text-sm text-brand-navy">Đã hoàn {formatMoneyVnd(selected.resolutionAmount)}</p>}
      </article>}
    </div> : <div className="rounded-2xl border border-dashed border-line p-8 text-center text-ink-500">Chưa có tranh chấp nào trong hàng đợi.</div>}
    {message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-brand-navy">{message}</p>}
    <Modal open={confirming} title="Xác nhận quyết định tranh chấp" onClose={() => !busy && setConfirming(false)}><div className="space-y-3 text-sm"><p><strong>{decision ? labels[decision] : ''}</strong>{decision === 'partial_refund' ? ` · ${formatMoneyVnd(amount)}` : ''}</p><p className="text-ink-500">{reason}</p><p className="rounded-xl bg-brand-yellow/30 p-3 text-ink-700">Sau khi xác nhận, quyết định này sẽ được áp dụng và bạn không thể sửa lại.</p></div><Button tone="danger" disabled={busy} className="mt-5" onClick={() => void decide()}>{busy ? 'Đang xử lý…' : 'Xác nhận quyết định'}</Button></Modal>
  </section>;
}
