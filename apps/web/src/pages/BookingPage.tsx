import { useEffect, useState } from 'react';
import { SlotGrid, type Slot } from '../components/SlotGrid';
import { BookingCancellationPanel } from '../components/BookingCancellationPanel';
import {
  createBooking, createHold, getCourtAvailability, getVenueDetail, searchVenues, selectSlot,
  type BookingSummary, type HoldResult, type SlotSelection, type VenueDetail, type VenueSearchRow,
} from '../lib/venueBookingApi';
import { payBookingBalance } from '../lib/financeApi';

function HoldCountdown({ expiresAt }: { expiresAt: string | null }) {
  const [remainingMs, setRemainingMs] = useState(0);
  useEffect(() => {
    if (!expiresAt) { setRemainingMs(0); return; }
    const tick = () => setRemainingMs(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const minutes = Math.floor(remainingMs / 60_000).toString().padStart(2, '0');
  const seconds = Math.floor((remainingMs % 60_000) / 1000).toString().padStart(2, '0');
  return (
    <div className="text-figures rounded-full bg-accent-red/10 px-4 py-2 text-sm text-accent-red">
      Giữ chỗ còn <span className="font-semibold">{minutes}:{seconds}</span>
    </div>
  );
}

export function BookingPage() {
  const [step, setStep] = useState(1);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [date] = useState(() => new Date(Date.now() + 48 * 3_600_000).toISOString().slice(0, 10));
  const [venues, setVenues] = useState<VenueSearchRow[]>([]);
  const [detail, setDetail] = useState<VenueDetail | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selection, setSelection] = useState<SlotSelection | null>(null);
  const [hold, setHold] = useState<HoldResult | null>(null);
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [message, setMessage] = useState('Nhập vị trí để tìm sân gần bạn.');
  const [loading, setLoading] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể xử lý yêu cầu.'); } finally { setLoading(false); }
  };

  const findVenues = () => run(async () => {
    const result = await searchVenues({ lat: Number(lat), lng: Number(lng), radiusKm: 10 });
    setVenues(result);
    setDetail(null); setSlots([]); setSelection(null); setHold(null); setBooking(null); setStep(1);
    setMessage(result.length ? 'Chọn cơ sở để xem lịch sân.' : 'Không tìm thấy sân phù hợp.');
  });

  const showVenue = (venueId: string) => run(async () => {
    const next = await getVenueDetail(venueId);
    const court = next.courts[0];
    if (!court) throw new Error('Cơ sở chưa có sân hoạt động.');
    const schedule = await getCourtAvailability(court.id, date);
    setDetail(next);
    setSlots(schedule.slots.map((slot) => ({
      time: `${Math.floor(slot.startMinute / 60).toString().padStart(2, '0')}:${(slot.startMinute % 60).toString().padStart(2, '0')}`,
      status: slot.available ? 'available' : 'booked',
      price: Number(slot.price ?? 0),
    })));
    setMessage(schedule.closed ? 'Sân đóng cửa vào ngày đã chọn.' : 'Chọn một slot trống trong lịch.');
  });

  const chooseSlot = (slot: Slot) => run(async () => {
    if (!detail) return;
    const court = detail.courts[0];
    const [hours, minutes] = slot.time.split(':').map(Number);
    const startAt = new Date(`${date}T${slot.time}:00.000Z`);
    if (Number.isNaN(startAt.getTime())) throw new Error('Khung giờ không hợp lệ.');
    const result = await selectSlot(court.id, { startAt: startAt.toISOString(), durationMinutes: 60 });
    setSelection(result); setStep(2); setMessage(`Đã chọn ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}, tổng ${Number(result.totalPrice).toLocaleString('vi-VN')}đ.`);
  });

  const reserve = () => run(async () => {
    if (!selection) return;
    const result = await createHold({ courtId: selection.courtId, startAt: selection.startAt, endAt: selection.endAt });
    setHold(result); setMessage('Đã giữ chỗ. Hãy tạo booking trước khi hết hạn.');
  });
  const makeBooking = () => run(async () => {
    if (!hold) return;
    const result = await createBooking(hold.id);
    setBooking(result); setStep(3); setMessage('Booking đã tạo. Chọn phương thức thanh toán.');
  });
  const payBalance = () => run(async () => {
    if (!booking) return;
    await payBookingBalance(booking.id); setMessage('Đã thanh toán bằng số dư; đang xác nhận booking.');
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-h2">Đặt sân</h1>
        <HoldCountdown expiresAt={hold?.expiresAt ?? null} />
      </div>

      <div className="mb-6 flex gap-2">
        {['Chọn slot', 'Xác nhận', 'Thanh toán'].map((label, i) => (
          <div
            key={label}
            className={`text-caption rounded-full px-3 py-1 ${
              step === i + 1 ? 'bg-primary-navy text-on-dark' : 'bg-bg-white text-text-primary/50'
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void findVenues(); }} className="mb-6 grid gap-3 rounded-2xl bg-bg-white p-4 sm:grid-cols-3">
        <input aria-label="Vĩ độ tìm sân" value={lat} onChange={(event) => setLat(event.target.value)} inputMode="decimal" placeholder="Vĩ độ" required />
        <input aria-label="Kinh độ tìm sân" value={lng} onChange={(event) => setLng(event.target.value)} inputMode="decimal" placeholder="Kinh độ" required />
        <button type="submit" disabled={loading} className="rounded-full bg-primary-navy px-4 py-2 text-caption text-on-dark">Tìm sân</button>
      </form>
      {message && <p role="status" className="mb-4 text-sm">{message}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {venues.map((venue) => <article key={venue.venueId} className="rounded-2xl bg-bg-white p-4 shadow-sm"><h2 className="text-h2 !text-xl">{venue.name}</h2><p className="text-body">{venue.address}</p><button type="button" disabled={loading} onClick={() => void showVenue(venue.venueId)} className="mt-3 rounded-full bg-primary-navy px-4 py-2 text-caption text-on-dark">Xem lịch {detail?.id === venue.venueId ? detail.courts[0]?.name ?? 'sân' : 'sân'}</button></article>)}
      </div>
      {detail && <div className="mt-6"><SlotGrid courtName={detail.courts[0]?.name ?? detail.name} slots={slots} onSelect={(slot) => void chooseSlot(slot)} /></div>}
      <div className="mt-8 flex flex-wrap justify-end gap-3">
        {selection && !hold && <button type="button" disabled={loading} onClick={() => void reserve()} className="rounded-full bg-accent-shuttle px-6 py-3 text-caption text-court-green">Giữ chỗ</button>}
        {hold && !booking && <button type="button" disabled={loading} onClick={() => void makeBooking()} className="rounded-full bg-accent-shuttle px-6 py-3 text-caption text-court-green">Tạo booking</button>}
        {booking && <button type="button" disabled={loading} onClick={() => void payBalance()} className="rounded-full bg-accent-shuttle px-6 py-3 text-caption text-court-green">Thanh toán số dư</button>}
      </div>
      <BookingCancellationPanel />
    </div>
  );
}
