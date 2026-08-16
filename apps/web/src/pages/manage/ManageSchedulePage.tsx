import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, SelectInput, SurfaceCard, TextInput } from '../../components/ui';
import { addClosure, saveOperatingHours } from '../../lib/venueBookingApi';

export const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

export function parseVietnameseDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  if (iso) return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const isoFromVi = `${match[3]}-${match[2]}-${match[1]}`;
  return new Date(`${isoFromVi}T00:00:00Z`).toISOString().slice(0, 10) === isoFromVi ? isoFromVi : null;
}

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'] as const;

export function ManageSchedulePage() {
  const [query] = useSearchParams();
  const courtId = query.get('courtId') ?? '';
  const [weekday, setWeekday] = useState(1);
  const [applyAllWeek, setApplyAllWeek] = useState(false);
  const [open, setOpen] = useState('08:00');
  const [close, setClose] = useState('22:00');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'hours' | 'closure' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const saveHours = async () => {
    if (!courtId) { setError('Hãy chọn sân con trước khi cấu hình lịch.'); return; }
    if (toMinutes(open) >= toMinutes(close)) { setError('Giờ đóng phải sau giờ mở.'); return; }
    setBusy('hours'); setError(''); setNotice('');
    try {
      const days = applyAllWeek ? [0, 1, 2, 3, 4, 5, 6] : [weekday];
      for (const day of days) {
        await saveOperatingHours(courtId, { weekday: day, openMinute: toMinutes(open), closeMinute: toMinutes(close) });
      }
      setNotice(applyAllWeek ? 'Đã lưu giờ hoạt động cho cả 7 ngày trong tuần.' : `Đã lưu giờ hoạt động ${WEEKDAYS[weekday]}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu giờ hoạt động.');
    } finally { setBusy(null); }
  };

  const saveClosure = async () => {
    const iso = parseVietnameseDate(date);
    if (!courtId) { setError('Hãy chọn sân con trước khi thêm ngày đóng.'); return; }
    if (!iso) { setError('Ngày đóng phải là ngày hợp lệ theo dd/MM/yyyy.'); return; }
    setBusy('closure'); setError(''); setNotice('');
    try {
      await addClosure(courtId, { date: `${iso}T00:00:00.000Z`, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      setDate(''); setReason('');
      setNotice('Đã thêm ngày đóng sân.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể thêm ngày đóng.');
    } finally { setBusy(null); }
  };

  return (
    <section className="grid max-w-2xl gap-5">
      <div>
        <h2 className="text-h2">Lịch hoạt động</h2>
        <p className="mt-1 text-sm text-ink-500">
          {courtId
            ? 'Cấu hình giờ mở cửa cho sân đã chọn. Dùng "Áp dụng cả tuần" để nhanh chóng thiết lập lịch giống nhau mọi ngày.'
            : 'Bạn cần chọn một sân con từ trang chi tiết cơ sở để bắt đầu cấu hình.'}
        </p>
      </div>

      <SurfaceCard className="grid gap-3">
        <h3 className="text-h3">Giờ mở cửa</h3>
        <label className="grid gap-1.5 text-sm font-medium">
          <span>Thứ trong tuần</span>
          <SelectInput
            aria-label="Thứ trong tuần"
            value={weekday}
            disabled={applyAllWeek}
            onChange={(event) => setWeekday(Number(event.target.value))}
          >
            {WEEKDAYS.map((label, day) => <option key={day} value={day}>{label}</option>)}
          </SelectInput>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={applyAllWeek}
            onChange={(event) => setApplyAllWeek(event.target.checked)}
          />
          <span>Áp dụng cho cả 7 ngày trong tuần</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Giờ mở
            <TextInput aria-label="Giờ mở" type="time" value={open} onChange={(event) => setOpen(event.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Giờ đóng
            <TextInput aria-label="Giờ đóng" type="time" value={close} onChange={(event) => setClose(event.target.value)} />
          </label>
        </div>
        <Button disabled={busy !== null || !courtId} onClick={() => void saveHours()}>
          {busy === 'hours' ? 'Đang lưu…' : 'Lưu giờ hoạt động'}
        </Button>
      </SurfaceCard>

      <SurfaceCard className="grid gap-3">
        <h3 className="text-h3">Ngày đóng sân</h3>
        <label className="grid gap-1.5 text-sm font-medium">
          Ngày
          <TextInput
            aria-label="Ngày đóng sân"
            placeholder="dd/MM/yyyy"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <span className="text-xs text-ink-500">Nhập theo dd/MM/yyyy hoặc yyyy-MM-dd.</span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Lý do
          <TextInput aria-label="Lý do đóng sân" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Bảo trì / Sự kiện…" />
        </label>
        <Button disabled={busy !== null || !courtId} onClick={() => void saveClosure()}>
          {busy === 'closure' ? 'Đang lưu…' : 'Thêm ngày đóng'}
        </Button>
      </SurfaceCard>

      {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-success-bg p-3 text-sm text-success">{notice}</p>}
    </section>
  );
}
