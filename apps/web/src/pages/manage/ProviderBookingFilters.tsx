import { Button, SelectInput, TextInput } from '../../components/ui.js';
import type { ManagedVenue } from '../../lib/venueBookingApi.js';
import type { ProviderBookingPageFilters } from './providerBookingView.js';

type Props = {
  value: ProviderBookingPageFilters;
  venues: ManagedVenue[];
  onChange: (next: ProviderBookingPageFilters) => void;
  onClear: () => void;
};

const scopes = [
  ['all', 'Tất cả'],
  ['past', 'Đã qua'],
  ['current', 'Đang diễn ra'],
  ['future', 'Sắp tới'],
] as const;

export function ProviderBookingFilters({ value, venues, onChange, onClear }: Props) {
  const courts = venues.find((venue) => venue.id === value.venueId)?.courts ?? [];

  return (
    <section className="surface-card p-4 sm:p-5" aria-label="Bộ lọc lượt đặt sân">
      <div className="flex flex-wrap gap-2" aria-label="Khoảng thời gian">
        {scopes.map(([timeScope, label]) => (
          <button
            key={timeScope}
            type="button"
            aria-pressed={value.timeScope === timeScope}
            onClick={() => onChange({ ...value, timeScope, page: 1 })}
            className={`min-h-10 rounded-full px-4 text-sm font-bold transition ${
              value.timeScope === timeScope
                ? 'bg-brand-navy text-surface shadow-sm'
                : 'border border-line bg-surface text-ink-500 hover:border-brand-navy hover:text-brand-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1.5 text-sm font-semibold text-ink-700 xl:col-span-2">
          Tìm kiếm
          <TextInput
            aria-label="Tìm lượt đặt sân"
            placeholder="Tên khách, cơ sở, sân hoặc mã đặt sân"
            value={value.query}
            onChange={(event) => onChange({ ...value, query: event.target.value, page: 1 })}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-ink-700">
          Cơ sở
          <SelectInput
            aria-label="Cơ sở"
            value={value.venueId}
            onChange={(event) => onChange({ ...value, venueId: event.target.value, courtId: '', page: 1 })}
          >
            <option value="">Tất cả cơ sở</option>
            {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
          </SelectInput>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-ink-700">
          Sân con
          <SelectInput
            aria-label="Sân con"
            value={value.courtId}
            disabled={!value.venueId}
            onChange={(event) => onChange({ ...value, courtId: event.target.value, page: 1 })}
          >
            <option value="">Tất cả sân</option>
            {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
          </SelectInput>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-ink-700">
          Trạng thái
          <SelectInput
            aria-label="Trạng thái"
            value={value.status}
            onChange={(event) => onChange({
              ...value,
              status: event.target.value as ProviderBookingPageFilters['status'],
              page: 1,
            })}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="held">Đã đặt cọc</option>
            <option value="confirmed">Đã xác nhận</option>
            <option value="completed">Đã hoàn thành</option>
            <option value="cancelled">Đã hủy</option>
          </SelectInput>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-ink-700">
          Từ ngày
          <TextInput
            aria-label="Từ ngày"
            type="date"
            value={value.from}
            onChange={(event) => onChange({ ...value, from: event.target.value, page: 1 })}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-ink-700">
          Đến ngày
          <TextInput
            aria-label="Đến ngày"
            type="date"
            value={value.to}
            onChange={(event) => onChange({ ...value, to: event.target.value, page: 1 })}
          />
        </label>
        <div className="flex items-end">
          <Button tone="secondary" className="w-full" onClick={onClear}>Xóa bộ lọc</Button>
        </div>
      </div>
    </section>
  );
}
