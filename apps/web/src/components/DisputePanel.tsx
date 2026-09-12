import { useEffect, useState } from 'react';
import { authorizeDisputeEvidence, createDispute, getEligibleDisputeBookings, getMyDisputes, uploadDisputeEvidence, type DisputeEligibleRow, type DisputeRow } from '../lib/financeApi';
import { getMyProfile } from '../lib/accountApi';
import { getVenueDetail } from '../lib/venueBookingApi';
import { Button, SurfaceCard, TextArea, TextInput } from './ui';
import { ImageUploadPicker, type UploadImageState } from './CommunityComposer';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';
import { useLiveDataRefresh } from '../realtime/dataInvalidation.js';

const CATEGORIES = ['Sân đóng cửa / không thể chơi', 'Dịch vụ không đúng mô tả', 'Sai thời lượng hoặc sân đã đặt', 'Vấn đề thanh toán', 'Vấn đề khác'] as const;
const statusLabel = (row: DisputeRow) => row.status === 'open' ? 'Đang xem xét' : row.resolution === 'full_refund' ? 'Đã hoàn toàn bộ' : row.resolution === 'partial_refund' ? 'Đã hoàn một phần' : 'Không được chấp nhận';

function EligibleBookingCard({ row, venueName, selected, onSelect }: { row: DisputeEligibleRow; venueName?: string; selected: boolean; onSelect: () => void }) {
  const hours = Math.max(0, Math.ceil((new Date(row.deadlineAt).getTime() - Date.now()) / 3_600_000));
  return <article className={`rounded-2xl border p-4 transition ${selected ? 'border-brand-navy bg-green-50/50 shadow-sm' : 'border-line bg-surface'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-brand-navy">{venueName ?? 'Ca chơi đã thanh toán'}</p><p className="mt-1 text-sm text-ink-500">Kết thúc {formatDateTimeVi(row.endAt)}</p></div><span className="rounded-full bg-brand-yellow px-3 py-1 text-xs font-bold text-brand-navy">Còn {hours} giờ</span></div>
    <div className="mt-4 flex items-center justify-between gap-3"><strong className="text-figures text-brand-navy">{formatMoneyVnd(row.gross)}</strong><Button size="sm" tone={selected ? 'secondary' : 'primary'} onClick={onSelect}>{selected ? 'Đang báo vấn đề' : 'Báo vấn đề'}</Button></div>
  </article>;
}

export function DisputePanel() {
  const [eligible, setEligible] = useState<DisputeEligibleRow[]>([]); const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [bookingId, setBookingId] = useState(''); const [category, setCategory] = useState(''); const [detail, setDetail] = useState(''); const [contactPhone, setContactPhone] = useState('');
  const [images, setImages] = useState<UploadImageState[]>([]); const [pickerVersion, setPickerVersion] = useState(0); const [message, setMessage] = useState(''); const [submitting, setSubmitting] = useState(false);
  const [venueNames, setVenueNames] = useState<Record<string, string>>({});
  const reload = () => Promise.all([getEligibleDisputeBookings(), getMyDisputes()]).then(async ([nextEligible, nextDisputes]) => { setEligible(nextEligible); setDisputes(nextDisputes); const ids = [...new Set(nextEligible.map((row) => row.venueId))]; const details = await Promise.all(ids.map((id) => getVenueDetail(id).catch(() => null))); setVenueNames(Object.fromEntries(details.filter(Boolean).map((venue) => [venue!.id, venue!.name]))); }).catch((error: Error) => setMessage(error.message));
  useEffect(() => { void reload(); void getMyProfile().then((profile) => setContactPhone(profile.phone ?? '')).catch(() => undefined); }, []);
  useLiveDataRefresh(reload);
  const uploadPending = images.some((image) => image.status === 'uploading'); const uploadFailed = images.some((image) => image.status === 'error');
  const canSubmit = Boolean(bookingId && category && detail.trim() && contactPhone.trim()) && !uploadPending && !uploadFailed && !submitting;

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!canSubmit) return; setSubmitting(true); setMessage('');
    try {
      await createDispute({ bookingId, reason: `${category} — ${detail.trim()}`, contactPhone: contactPhone.trim(), evidence: images.filter((image) => image.status === 'uploaded' && image.objectKey).map((image) => image.objectKey!) });
      setBookingId(''); setCategory(''); setDetail(''); setImages([]); setPickerVersion((value) => value + 1); setMessage('Đã gửi yêu cầu. Admin sẽ dùng số điện thoại bạn cung cấp nếu cần trao đổi thêm.'); await reload();
    } catch (error) { setMessage((error as Error).message); } finally { setSubmitting(false); }
  }

  return <section className="mt-8" aria-labelledby="dispute-title">
    <div className="rounded-3xl bg-brand-navy p-5 text-surface sm:p-6"><p className="text-caption text-brand-yellow">Hỗ trợ sau ca chơi</p><h2 id="dispute-title" className="mt-1 font-display text-2xl font-extrabold">Bạn gặp vấn đề với booking?</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-surface/75">Chọn đúng ca chơi bên dưới. Bạn có 24 giờ sau khi ca kết thúc để gửi yêu cầu.</p></div>
    {eligible.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">{eligible.map((row) => <EligibleBookingCard key={row.bookingId} row={row} venueName={venueNames[row.venueId]} selected={bookingId === row.bookingId} onSelect={() => setBookingId(row.bookingId)} />)}</div> : <SurfaceCard className="mt-5"><p className="font-bold text-brand-navy">Hiện không có booking cần hỗ trợ</p><p className="mt-1 text-sm text-ink-500">Booking chỉ có thể tranh chấp sau khi ca kết thúc và trong vòng 24 giờ.</p></SurfaceCard>}
    {bookingId && <SurfaceCard className="mt-5"><form onSubmit={submit} className="grid gap-5">
      <fieldset><legend className="font-bold text-brand-navy">1. Vấn đề bạn gặp phải</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{CATEGORIES.map((item) => <label key={item} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${category === item ? 'border-brand-navy bg-green-50 text-brand-navy' : 'border-line'}`}><input type="radio" name="dispute-category" value={item} checked={category === item} onChange={() => setCategory(item)} />{item}</label>)}</div></fieldset>
      <label className="grid gap-2 text-sm font-bold text-brand-navy">2. Mô tả ngắn<TextArea aria-label="Mô tả vấn đề" value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Điều gì đã xảy ra?" required /></label>
      <label className="grid gap-2 text-sm font-bold text-brand-navy">3. Số điện thoại liên hệ<TextInput aria-label="Số điện thoại liên hệ" type="tel" autoComplete="tel" inputMode="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="Ví dụ: 0901234567" required /><span className="font-normal text-ink-500">Chỉ dùng để Admin liên hệ về yêu cầu này.</span></label>
      <div><p className="mb-2 text-sm font-bold text-brand-navy">4. Ảnh bằng chứng <span className="font-normal text-ink-500">(không bắt buộc, tối đa 5)</span></p><ImageUploadPicker key={pickerVersion} label="Thêm ảnh bằng chứng" maxFiles={5} authorize={authorizeDisputeEvidence} upload={uploadDisputeEvidence} onUploadedChange={setImages} /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-sm text-ink-500">{uploadPending ? 'Đang tải ảnh…' : uploadFailed ? 'Có ảnh cần thử lại hoặc gỡ.' : 'Kiểm tra thông tin trước khi gửi.'}</p><Button type="submit" disabled={!canSubmit}>{submitting ? 'Đang gửi…' : 'Gửi yêu cầu'}</Button></div>
    </form></SurfaceCard>}
    <div className="mt-8"><h3 className="text-h3">Theo dõi yêu cầu</h3><div className="mt-3 grid gap-3">{disputes.length ? disputes.map((row) => <article key={row.id} className="rounded-2xl border border-line bg-surface p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-brand-navy">{statusLabel(row)}</span><time className="text-xs text-ink-500">Gửi {formatDateTimeVi(row.createdAt)}</time></div><p className="mt-3 font-semibold text-ink-900">{row.reason}</p><p className="mt-2 text-sm text-ink-500">Liên hệ: {row.contactPhone ?? 'Không có dữ liệu'}{row.resolutionAmount ? ` · Đã hoàn ${formatMoneyVnd(row.resolutionAmount)}` : ''}</p></article>) : <p className="text-sm text-ink-500">Bạn chưa gửi yêu cầu tranh chấp nào.</p>}</div></div>
    {message && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-brand-navy" role="status">{message}</p>}
  </section>;
}
