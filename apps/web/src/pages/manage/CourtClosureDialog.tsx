import { useState } from 'react';
import { Button, Modal, TextInput } from '../../components/ui';
import { addClosure, removeClosure, type ManagedCourt } from '../../lib/venueBookingApi';

type Closure = ManagedCourt['closures'][number];

export const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Nhận dd/MM/yyyy hoặc yyyy-MM-dd; trả yyyy-MM-dd khi là ngày có thật. */
export function parseVietnameseDate(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  return iso && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

/** Khóa lịch một sân con (cả ngày hoặc theo khung giờ) và mở lại các khóa sắp tới. */
export function CourtClosureDialog({ court, onClose, onChanged }: { court: ManagedCourt; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const [mode, setMode] = useState<'day' | 'range'>('day');
  const [date, setDate] = useState('');
  const [rangeStart, setRangeStart] = useState('08:00');
  const [rangeEnd, setRangeEnd] = useState('10:00');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const today = new Date().toLocaleDateString('en-CA');
  const closures = (court.closures ?? [])
    .filter((item: Closure) => item.date.slice(0, 10) >= today)
    .sort((a: Closure, b: Closure) => a.date.localeCompare(b.date) || (a.startMinute ?? -1) - (b.startMinute ?? -1));

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await onChanged(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể cập nhật khóa lịch.'); } finally { setBusy(false); }
  };
  const save = () => {
    const iso = parseVietnameseDate(date);
    if (!iso) return setError('Chọn ngày khóa hợp lệ.');
    if (mode === 'range' && toMinutes(rangeStart) >= toMinutes(rangeEnd)) return setError('Giờ kết thúc phải sau giờ bắt đầu.');
    void run(async () => {
      await addClosure(court.id, {
        date: `${iso}T00:00:00.000Z`,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(mode === 'range' ? { startMinute: toMinutes(rangeStart), endMinute: toMinutes(rangeEnd) } : {}),
      });
      setDate(''); setReason('');
    });
  };

  return (
    <Modal open title={`Khóa lịch · ${court.name}`} onClose={() => !busy && onClose()}>
      <div className="grid gap-4">
        {closures.length > 0 && (
          <ul className="divide-y divide-line border-y border-line">
            {closures.map((closure: Closure) => (
              <li key={closure.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <strong>{closure.date.slice(0, 10).split('-').reverse().join('/')} · {closure.startMinute == null || closure.endMinute == null ? 'cả ngày' : `${hhmm(closure.startMinute)}–${hhmm(closure.endMinute)}`}</strong>
                  {closure.reason ? <span className="text-ink-500"> · {closure.reason}</span> : null}
                </span>
                <button type="button" disabled={busy} onClick={() => void run(() => removeClosure(court.id, closure.id))} className="text-xs font-bold text-danger hover:underline">Mở lại</button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">Ngày khóa<TextInput aria-label="Ngày khóa lịch" type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <fieldset className="grid gap-1.5 text-sm font-medium"><legend className="mb-1.5">Phạm vi</legend>
            <div className="flex gap-4 py-2.5">
              <label className="flex items-center gap-2"><input type="radio" name="closure-mode" className="accent-brand-navy" checked={mode === 'day'} onChange={() => setMode('day')} />Cả ngày</label>
              <label className="flex items-center gap-2"><input type="radio" name="closure-mode" className="accent-brand-navy" checked={mode === 'range'} onChange={() => setMode('range')} />Theo khung giờ</label>
            </div>
          </fieldset>
        </div>
        {mode === 'range' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">Từ<TextInput aria-label="Khóa từ" type="time" step={1800} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></label>
            <label className="grid gap-1.5 text-sm font-medium">Đến<TextInput aria-label="Khóa đến" type="time" step={1800} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></label>
          </div>
        )}
        <TextInput aria-label="Lý do khóa lịch" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do (VD: Bảo trì)" />
        {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        <Button className="w-full" disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Thêm khóa lịch'}</Button>
      </div>
    </Modal>
  );
}
