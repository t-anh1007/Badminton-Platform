export type SlotStatus = 'available' | 'held' | 'booked';

export interface Slot {
  time: string;
  status: SlotStatus;
  price: number;
}

const STATUS_STYLE: Record<SlotStatus, string> = {
  available: 'bg-surface text-ink-900 hover:-translate-y-0.5 hover:shadow-md cursor-pointer',
  held: 'bg-green-600/30 text-green-700 cursor-not-allowed',
  booked: 'bg-ink-700/10 text-ink-900/40 cursor-not-allowed',
};

const STATUS_LABEL: Record<SlotStatus, string> = {
  available: 'Trống',
  held: 'Đang giữ',
  booked: 'Đã đặt',
};

/**
 * Slot grid — baseline cho BOK-04/05/06: lịch trống theo giờ/sân, trạng thái
 * slot + giá. Countdown giữ chỗ Redis là mock ở đây, thật thuộc G3.
 */
export function SlotGrid({ courtName, slots, onSelect }: { courtName: string; slots: Slot[]; onSelect?: (slot: Slot) => void }) {
  return (
    <div className="rounded-2xl bg-canvas p-4">
      <h3 className="text-caption mb-3">{courtName}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {slots.map((slot) => (
          <button
            type="button"
            key={slot.time}
            disabled={slot.status !== 'available'}
            aria-label={slot.status === 'available' ? `Chọn ${slot.time}` : `${STATUS_LABEL[slot.status]} ${slot.time}`}
            onClick={() => onSelect?.(slot)}
            className={`rounded-lg px-3 py-2 text-center transition-all duration-150 ${STATUS_STYLE[slot.status]}`}
          >
            <div className="text-figures text-sm font-medium">{slot.time}</div>
            <div className="text-caption !text-inherit">{STATUS_LABEL[slot.status]}</div>
            <div className="text-figures text-xs">{slot.price.toLocaleString('vi-VN')}đ</div>
          </button>
        ))}
      </div>
    </div>
  );
}
