import { SelectInput, TextInput } from './ui';

export type PeriodMode = 'all' | 'day' | 'month' | 'year' | 'range';
export type Period = { mode: PeriodMode; day: string; month: string; year: string; from: string; to: string };

const MODES: Array<[PeriodMode, string]> = [['all', 'Toàn bộ'], ['day', 'Theo ngày'], ['month', 'Theo tháng'], ['year', 'Theo năm'], ['range', 'Từ ngày – đến ngày']];

export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
export const newPeriod = (mode: PeriodMode = 'all'): Period => {
  const today = todayIso();
  return { mode, day: today, month: today.slice(0, 7), year: today.slice(0, 4), from: '', to: today };
};

/** Kỳ đang chọn -> khoảng yyyy-MM-dd (bỏ trống = không giới hạn). */
export function periodRange(period: Period): { from?: string; to?: string } {
  if (period.mode === 'day') return { from: period.day, to: period.day };
  if (period.mode === 'month' && period.month) {
    const [year, month] = period.month.split('-').map(Number);
    return { from: `${period.month}-01`, to: `${period.month}-${String(new Date(year!, month!, 0).getDate()).padStart(2, '0')}` };
  }
  if (period.mode === 'year') return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
  if (period.mode === 'range') return { from: period.from || undefined, to: period.to || undefined };
  return {};
}

/** Biên ngày theo giờ Việt Nam để gửi API. */
export function periodQuery(period: Period): { from?: string; to?: string } {
  const range = periodRange(period);
  return {
    from: range.from ? `${range.from}T00:00:00.000+07:00` : undefined,
    to: range.to ? `${range.to}T23:59:59.999+07:00` : undefined,
  };
}

export function PeriodFilter({ value, onChange }: { value: Period; onChange: (next: Period) => void }) {
  const thisYear = Number(todayIso().slice(0, 4));
  const years = Array.from({ length: thisYear - 2023 }, (_, index) => String(thisYear - index));
  const set = (patch: Partial<Period>) => onChange({ ...value, ...patch });
  return <div className="flex flex-wrap items-end gap-2">
    <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Kỳ xem
      <SelectInput aria-label="Kỳ xem" value={value.mode} onChange={(event) => set({ mode: event.target.value as PeriodMode })}>{MODES.map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}</SelectInput>
    </label>
    {value.mode === 'day' ? <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Ngày<TextInput aria-label="Chọn ngày" type="date" value={value.day} onChange={(event) => { if (event.target.value) set({ day: event.target.value }); }} /></label> : null}
    {value.mode === 'month' ? <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Tháng<TextInput aria-label="Chọn tháng" type="month" value={value.month} onChange={(event) => { if (event.target.value) set({ month: event.target.value }); }} /></label> : null}
    {value.mode === 'year' ? <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Năm<SelectInput aria-label="Chọn năm" value={value.year} onChange={(event) => set({ year: event.target.value })}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</SelectInput></label> : null}
    {value.mode === 'range' ? <>
      <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Từ ngày<TextInput aria-label="Từ ngày" type="date" value={value.from} max={value.to || undefined} onChange={(event) => set({ from: event.target.value })} /></label>
      <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-ink-500">Đến ngày<TextInput aria-label="Đến ngày" type="date" value={value.to} min={value.from || undefined} onChange={(event) => set({ to: event.target.value })} /></label>
    </> : null}
  </div>;
}
