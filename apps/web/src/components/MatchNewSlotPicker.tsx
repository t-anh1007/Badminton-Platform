import { useEffect, useMemo, useRef, useState } from 'react';
import { toVietnameseSlotIso, toggleSlot, type BookingRange } from '../booking/selection.js';
import { SlotGrid, type Slot } from './SlotGrid';
import { Button, Skeleton, TextInput } from './ui';
import { VenueListPage } from '../pages/VenueListPage';
import { MATCH_MIN_LEAD_HOURS } from '../lib/matchApi';
import { vietnamDateInput } from '../lib/formatters.js';
import { getCourtAvailability, getVenueDetail, selectSlot, type VenueDetail, type VenueSearchRow } from '../lib/venueBookingApi';

/** Khung giờ mới chọn ngay trong màn tạo kèo; chỉ giữ chỗ khi bấm công bố. */
export interface NewSlotSelection {
  range: BookingRange;
  venueName: string;
  venueAddress: string;
  courtName: string;
}

const hhmm = (minute: number) => `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;

export function MatchNewSlotPicker({ onChange }: { onChange: (value: NewSlotSelection | null) => void }) {
  // Chọn cơ sở bằng chính màn tìm sân (vị trí, bản đồ, tên, giá) thay cho danh sách thả xuống.
  const [venue, setVenue] = useState<VenueSearchRow | null>(null);
  const venueId = venue?.venueId ?? '';
  const [detail, setDetail] = useState<VenueDetail | null>(null);
  const [courtId, setCourtId] = useState('');
  // Kèo cần còn ít nhất 24 giờ nên mặc định chọn ngày kia.
  const [date, setDate] = useState(() => vietnamDateInput(new Date(Date.now() + 2 * 86_400_000)));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [range, setRange] = useState<BookingRange | null>(null);
  const [message, setMessage] = useState('');
  const requestId = useRef(0);
  const court = detail?.courts.find((item) => item.id === courtId);
  const rule = court?.bookingRule ?? null;

  useEffect(() => {
    setDetail(null);
    setCourtId('');
    if (!venueId) return;
    let active = true;
    void getVenueDetail(venueId)
      .then((next) => { if (!active) return; setDetail(next); setCourtId(next.courts[0]?.id ?? ''); })
      .catch((cause) => { if (active) setMessage(cause instanceof Error ? cause.message : 'Không thể tải thông tin sân.'); });
    return () => { active = false; };
  }, [venueId]);

  useEffect(() => {
    setRange(null);
    setSlots([]);
    if (!courtId || !date) return;
    const id = ++requestId.current;
    setLoadingSlots(true);
    setMessage('');
    const minStart = Date.now() + MATCH_MIN_LEAD_HOURS * 3_600_000;
    void getCourtAvailability(courtId, date)
      .then((schedule) => {
        if (id !== requestId.current) return;
        setSlots(schedule.slots.map((slot) => {
          const startAt = toVietnameseSlotIso(date, slot.startMinute);
          const tooSoon = new Date(startAt).getTime() < minStart;
          const available = slot.available && !tooSoon;
          return {
            time: hhmm(slot.startMinute),
            endTime: hhmm(slot.endMinute),
            status: tooSoon ? 'past' : slot.available ? 'available' : 'unavailable',
            price: Number(slot.price ?? 0),
            selection: { courtId, date, startAt, endMinute: slot.endMinute, available, price: slot.price ?? '0' },
          };
        }));
        if (schedule.closed) setMessage('Sân đóng cửa vào ngày đã chọn.');
      })
      .catch((cause) => { if (id === requestId.current) setMessage(cause instanceof Error ? cause.message : 'Không thể tải lịch sân.'); })
      .finally(() => { if (id === requestId.current) setLoadingSlots(false); });
  }, [courtId, date]);

  useEffect(() => {
    const valid = range && (!rule || range.durationMinutes >= rule.minDurationMinutes);
    onChange(valid && detail && court ? { range, venueName: detail.name, venueAddress: detail.address, courtName: court.name } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, rule, detail, court]);

  const rendered = useMemo(() => slots.map((slot) => ({
    ...slot,
    selected: Boolean(range && slot.selection && slot.selection.startAt >= range.startAt && slot.selection.startAt < range.endAt),
  })), [range, slots]);

  const choose = (slot: Slot) => {
    if (!slot.selection || slot.status !== 'available') return;
    const proposed = toggleSlot(range, slot.selection, slots.flatMap((item) => item.selection ? [item.selection] : []));
    if (proposed === range) { setMessage('Chỉ có thể chọn các khung giờ trống liền nhau trên cùng một sân.'); return; }
    if (!proposed) { setRange(null); setMessage(''); return; }
    if (rule && proposed.durationMinutes > rule.maxDurationMinutes) { setMessage(`Mỗi lượt đặt tối đa ${rule.maxDurationMinutes} phút. Hãy bỏ bớt một khung giờ.`); return; }
    if (rule && proposed.durationMinutes < rule.minDurationMinutes) {
      setRange(proposed);
      setMessage(`Chọn thêm khung giờ liền nhau (tối thiểu ${rule.minDurationMinutes} phút) để tiếp tục.`);
      return;
    }
    void selectSlot(proposed.courtId, { startAt: proposed.startAt, durationMinutes: proposed.durationMinutes })
      .then((validated) => {
        setRange({ ...proposed, startAt: validated.startAt, endAt: validated.endAt, durationMinutes: validated.durationMinutes, totalPrice: validated.totalPrice });
        setMessage('');
      })
      .catch((cause) => setMessage(cause instanceof Error ? cause.message : 'Không thể chọn khung giờ này.'));
  };

  if (!venue) return <div className="mt-4"><VenueListPage onSelectVenue={setVenue} /></div>;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-canvas p-3">
        <div>
          <p className="font-semibold text-ink-900">{venue.name}</p>
          <p className="text-xs text-ink-500">{venue.address} · ~{venue.distanceKm.toFixed(1)} km</p>
        </div>
        <Button type="button" tone="secondary" size="sm" onClick={() => { setVenue(null); setMessage(''); }}>Đổi cơ sở</Button>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Sân con</legend>
        {!detail ? <Skeleton className="mt-2 h-9" /> : (
          <div className="mt-2 flex flex-wrap gap-2">
            {detail.courts.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={courtId === item.id}
                onClick={() => setCourtId(item.id)}
                className={`min-h-9 rounded-full border px-4 text-sm font-medium transition ${courtId === item.id ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-surface text-ink-600 hover:border-brand-navy hover:text-brand-navy'}`}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
      </fieldset>
      <label className="block max-w-xs text-sm font-medium">
        Ngày
        <TextInput aria-label="Ngày chơi" type="date" className="mt-1" min={vietnamDateInput(new Date())} value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      {loadingSlots ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20" />)}</div>
      ) : slots.length > 0 && (
        <SlotGrid courtName={court?.name ?? 'Sân'} slots={rendered} onSelect={choose} />
      )}
      <p className="text-xs text-ink-500">{`Chỉ chọn được khung giờ còn ít nhất ${MATCH_MIN_LEAD_HOURS} giờ nữa. Khung giờ chỉ được giữ chỗ khi bạn bấm công bố kèo.`}</p>
      {message && <p role="status" className="rounded-xl bg-canvas p-3 text-sm text-ink-600">{message}</p>}
    </div>
  );
}
