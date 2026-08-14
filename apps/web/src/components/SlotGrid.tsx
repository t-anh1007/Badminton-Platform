export type SlotStatus = 'available' | 'held' | 'booked' | 'unavailable';

export interface Slot {
  time: string;
  status: SlotStatus;
  price: number;
  selected?: boolean;
}

const STATUS_STYLE: Record<SlotStatus, string> = {
  available: 'border border-line bg-surface text-ink-900 hover:-translate-y-0.5 hover:border-brand-navy hover:shadow-md cursor-pointer',
  held: 'bg-brand-yellow text-brand-navy cursor-not-allowed',
  booked: 'bg-ink-700/10 text-ink-900/40 cursor-not-allowed',
  unavailable: 'bg-ink-700/10 text-ink-900/40 cursor-not-allowed',
};

const STATUS_LABEL: Record<SlotStatus, string> = {
  available: 'Trống',
  held: 'Đang giữ',
  booked: 'Đã đặt',
  unavailable: 'Đã kín',
};

/** Slot state and price rendered from the real availability response. */
export function SlotGrid({ courtName, slots, onSelect }: { courtName: string; slots: Slot[]; onSelect?: (slot: Slot) => void }) {
  return (
    <div className="rounded-2xl bg-canvas p-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-caption">Sơ đồ trực tuyến · {courtName}</h3><span className="text-xs text-ink-500">Trống · Giữ · Đã đặt</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {slots.map((slot) => (
          <button
            type="button"
            key={slot.time}
            disabled={slot.status !== 'available'}
            aria-pressed={slot.selected ?? false}
            aria-label={slot.status === 'available' ? `Chọn ${slot.time}` : `${STATUS_LABEL[slot.status]} ${slot.time}`}
            onClick={() => onSelect?.(slot)}
            className={`rounded-xl px-3 py-3 text-center transition-all duration-150 ${slot.selected ? 'border-brand-navy bg-brand-yellow text-brand-navy ring-2 ring-brand-navy' : STATUS_STYLE[slot.status]}`}
          >
            <div className="text-figures text-sm font-medium">{slot.time}</div>
            <div className="text-caption !text-inherit">{slot.selected ? 'ĐÃ CHỌN' : STATUS_LABEL[slot.status]}</div>
            <div className="text-figures text-xs">{slot.price.toLocaleString('vi-VN')}đ</div>
          </button>
        ))}
      </div>
    </div>
  );
}
