import { useState } from 'react';
import { Button, TextArea } from '../../components/ui.js';
import { Icon } from '../../components/Icon';
import { cancelProviderBooking, changeBookingCourt, getReplacementCourts } from '../../lib/venueBookingApi.js';

/** Sự cố tại sân cho một lượt đặt: đổi sang sân trống cùng giờ hoặc hủy do lỗi phía sân (hoàn 100%). */
export function BookingIncidentActions({ bookingId, onDone }: { bookingId: string; onDone: () => Promise<void> | void }) {
  const [mode, setMode] = useState<'' | 'replace' | 'cancel'>('');
  const [courts, setCourts] = useState<Array<{ id: string; name: string }>>([]);
  const [courtId, setCourtId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); setMode(''); await onDone(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể xử lý sự cố.'); } finally { setBusy(false); }
  };
  const openReplace = async () => {
    setBusy(true); setError('');
    try { const result = await getReplacementCourts(bookingId); setCourts(result.courts); setCourtId(result.courts[0]?.id ?? ''); setMode('replace'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải sân thay thế.'); } finally { setBusy(false); }
  };

  return (
    <section className="border-t border-line pt-4">
      {mode === '' && <>
        <p className="mb-2 text-sm font-semibold text-ink-700">Sự cố tại sân?</p>
        <div className="flex gap-2">
          <Button tone="secondary" size="sm" className="flex-1" disabled={busy} onClick={() => void openReplace()}><Icon name="swap" className="h-4 w-4" />Đổi sân</Button>
          <Button tone="secondary" size="sm" className="flex-1 text-danger" disabled={busy} onClick={() => setMode('cancel')}>Hủy do lỗi sân</Button>
        </div>
      </>}
      {mode === 'replace' && (courts.length ? <fieldset className="grid gap-2">
        <legend className="mb-2 font-bold text-ink-900">Đổi sang sân trống cùng giờ</legend>
        {courts.map((court) => <label key={court.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 ${courtId === court.id ? 'border-brand-navy ring-4 ring-green-100' : 'border-line'}`}><input type="radio" name="replacement-court" className="h-5 w-5 accent-brand-navy" checked={courtId === court.id} onChange={() => setCourtId(court.id)} /><span className="font-bold">{court.name}</span></label>)}
        <div className="mt-2 flex gap-2"><Button tone="secondary" size="sm" disabled={busy} onClick={() => setMode('')}>Quay lại</Button><Button size="sm" className="flex-1" disabled={busy || !courtId} onClick={() => void run(() => changeBookingCourt(bookingId, courtId))}>Xác nhận đổi sân</Button></div>
      </fieldset> : <div className="grid gap-2 text-sm"><p className="rounded-xl bg-canvas p-3 text-ink-700">Không còn sân trống cùng giờ. Bạn có thể hủy do lỗi sân.</p><div className="flex gap-2"><Button tone="secondary" size="sm" onClick={() => setMode('')}>Quay lại</Button><Button tone="secondary" size="sm" className="flex-1 text-danger" onClick={() => setMode('cancel')}>Hủy do lỗi sân</Button></div></div>)}
      {mode === 'cancel' && <div className="grid gap-2">
        <p className="font-bold text-ink-900">Hủy do lỗi phía sân</p>
        <TextArea aria-label="Lý do lỗi phía sân" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="VD: Mất điện, sân ướt…" />
        <p className="text-xs text-ink-500">Khách được hoàn 100% vào ví và được báo ngay.</p>
        <div className="flex gap-2"><Button tone="secondary" size="sm" disabled={busy} onClick={() => setMode('')}>Quay lại</Button><Button tone="danger" size="sm" className="flex-1" disabled={busy || !reason.trim()} onClick={() => void run(() => cancelProviderBooking(bookingId, reason.trim()))}>Xác nhận hủy lượt đặt sân</Button></div>
      </div>}
      {error && <p role="alert" className="mt-2 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
    </section>
  );
}
