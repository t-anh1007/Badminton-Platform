import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { AuthForm } from '../components/AuthForm';
import { SlotGrid, type Slot, type SlotStatus } from '../components/SlotGrid';
import { Button, EmptyState, Modal, SegmentedControl, Skeleton, SurfaceCard } from '../components/ui';
import { PageHeader } from '../components/courtin/PageHeader';
import { createBooking, createHold, getCourtAvailability, getVenueDetail, selectSlot, type BookingSummary, type HoldResult, type SlotSelection, type VenueDetail } from '../lib/venueBookingApi';
import { createBookingSepayIntent, payBookingBalance } from '../lib/financeApi';

const money = (value?: string) => `${BigInt(value ?? '0').toLocaleString('vi-VN')}đ`;

function isAuthenticationFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /401|unauthori[sz]ed|đăng nhập|token|xác thực/i.test(message);
}

function slotTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')}`;
}

function HoldCountdown({ expiresAt, onExpired }: { expiresAt?: string; onExpired: () => void }) {
  const [remaining, setRemaining] = useState(0);
  const onExpiredRef = useRef(onExpired);
  useEffect(() => { onExpiredRef.current = onExpired; }, [onExpired]);
  useEffect(() => {
    if (!expiresAt) return;
    const deadline = new Date(expiresAt).getTime();
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const interval = window.setInterval(tick, 1_000);
    const timeout = window.setTimeout(() => onExpiredRef.current(), Math.max(0, deadline - Date.now()));
    return () => { window.clearInterval(interval); window.clearTimeout(timeout); };
  }, [expiresAt]);
  if (!expiresAt) return null;
  return <span className={`text-figures rounded-full px-3 py-2 text-sm ${remaining < 120_000 ? 'bg-danger-bg text-danger' : 'bg-brand-yellow text-brand-navy'}`}>Giữ chỗ {Math.floor(remaining / 60_000).toString().padStart(2, '0')}:{Math.floor((remaining % 60_000) / 1_000).toString().padStart(2, '0')}</span>;
}

export function BookingPage() {
  const [params] = useSearchParams();
  const venueId = params.get('venueId');
  const [detail, setDetail] = useState<VenueDetail | null>(null);
  const [courtId, setCourtId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selection, setSelection] = useState<SlotSelection | null>(null);
  const [hold, setHold] = useState<HoldResult | null>(null);
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'sepay'>('balance');
  const [sepayCode, setSepayCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const retryAfterAuth = useRef<(() => void) | null>(null);
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));

  const step = booking ? 3 : hold ? 2 : 1;

  const loadAvailability = async (nextCourtId: string, nextDate: string) => {
    setLoading(true);
    setError('');
    try {
      const schedule = await getCourtAvailability(nextCourtId, nextDate);
      setSlots(schedule.slots.map((slot) => ({
        time: `${Math.floor(slot.startMinute / 60).toString().padStart(2, '0')}:${(slot.startMinute % 60).toString().padStart(2, '0')}`,
        status: slot.available ? 'available' : 'unavailable',
        price: Number(slot.price ?? 0),
      })));
      if (schedule.closed) setMessage('Sân đóng cửa vào ngày đã chọn.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tải lịch sân.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!venueId) return;
    getVenueDetail(venueId).then((venue) => {
      const firstCourt = venue.courts[0];
      if (!firstCourt) throw new Error('Cơ sở chưa có sân hoạt động.');
      setDetail(venue);
      setCourtId(firstCourt.id);
      return loadAvailability(firstCourt.id, date);
    }).catch((caught: Error) => { setError(caught.message); setLoading(false); });
  }, [venueId]);

  if (!venueId) return <Navigate to="/venues" replace />;

  const updateSelectedSlot = (status: SlotStatus) => {
    if (!selection) return;
    const time = slotTime(selection.startAt);
    setSlots((current) => current.map((slot) => slot.time === time ? { ...slot, status } : slot));
  };

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setError('');
    try {
      await action();
    } catch (caught) {
      if (isAuthenticationFailure(caught)) {
        retryAfterAuth.current = () => { void run(action); };
        setMessage('Đăng nhập để tiếp tục đặt sân.');
        setAuthOpen(true);
      } else {
        setError(caught instanceof Error ? caught.message : 'Không thể xử lý yêu cầu.');
      }
    } finally {
      setLoading(false);
    }
  };

  const choose = (slot: Slot) => run(async () => {
    const startAt = new Date(`${date}T${slot.time}:00.000Z`);
    const next = await selectSlot(courtId, { startAt: startAt.toISOString(), durationMinutes: 60 });
    setSelection(next);
    setHold(null);
    setBooking(null);
    setSepayCode('');
    setMessage('Đã chọn slot. Hãy giữ chỗ để tiếp tục.');
  });

  const reserve = () => run(async () => {
    if (!selection) return;
    const next = await createHold({ courtId: selection.courtId, startAt: selection.startAt, endAt: selection.endAt });
    setHold(next);
    updateSelectedSlot('held');
    setMessage('Đã giữ chỗ trong 10 phút.');
  });

  const create = () => run(async () => {
    if (!hold) return;
    const next = await createBooking(hold.id);
    setBooking(next);
    setMessage('Booking đã tạo. Chọn phương thức thanh toán.');
  });

  const pay = () => run(async () => {
    if (!booking) return;
    if (paymentMethod === 'balance') {
      await payBookingBalance(booking.id);
      updateSelectedSlot('booked');
      setMessage('Đã thanh toán bằng số dư.');
    } else {
      const intent = await createBookingSepayIntent(booking.id);
      setSepayCode(intent.matchCode);
      setMessage(`Chuyển đúng ${money(intent.amount)} với mã ${intent.matchCode} để SePay xác nhận.`);
    }
  });

  const expireHold = () => {
    if (!hold) return;
    setHold(null);
    setBooking(null);
    setSelection(null);
    setSepayCode('');
    setMessage('Hết thời gian giữ chỗ, hãy chọn lại slot.');
    if (courtId) void loadAvailability(courtId, date);
  };

  return (
    <main className="page-container py-8 sm:py-12">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><PageHeader eyebrow="Đặt sân" title={detail?.name ?? 'Đang tải cơ sở…'} description={detail?.address} /><HoldCountdown expiresAt={hold?.expiresAt} onExpired={expireHold} /></div>
      <div className="mb-6 flex flex-wrap gap-2">{['Chọn slot', 'Xác nhận', 'Thanh toán'].map((label, index) => <span key={label} className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[.04em] ${step === index + 1 ? 'bg-brand-navy text-surface' : 'border border-line bg-surface text-ink-500'}`}>{index + 1}. {label}</span>)}</div>
      {error && <SurfaceCard className="mb-5 border-danger bg-danger-bg"><p role="alert" className="text-danger">{error}</p><Link to="/venues" className="mt-2 inline-block text-sm font-semibold text-green-700 hover:underline">Quay lại danh sách sân</Link></SurfaceCard>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section><SurfaceCard><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Ngày<input type="date" value={date} onChange={(event) => { setDate(event.target.value); if (courtId) void loadAvailability(courtId, event.target.value); }} className="rounded-xl border border-line bg-surface px-3 py-2.5" /></label><label className="grid gap-1.5 text-sm font-medium">Sân con<select value={courtId} onChange={(event) => { setCourtId(event.target.value); void loadAvailability(event.target.value, date); }} className="rounded-xl border border-line bg-surface px-3 py-2.5">{detail?.courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label></div>{loading ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-20" />)}</div> : slots.length ? <div className="mt-5"><SlotGrid courtName={detail?.courts.find((court) => court.id === courtId)?.name ?? 'Sân'} slots={slots} onSelect={(slot) => void choose(slot)} /></div> : <div className="mt-5"><EmptyState title="Không còn slot trống" description="Hãy chọn ngày hoặc sân con khác." /></div>}</SurfaceCard></section>
        <aside className="lg:sticky lg:top-24 lg:self-start"><SurfaceCard><h2 className="text-h3">Tóm tắt đặt sân</h2>{selection ? <div className="mt-4 space-y-2 text-sm text-ink-500"><p>{detail?.name} · {detail?.courts.find((court) => court.id === selection.courtId)?.name}</p><p>{new Date(selection.startAt).toLocaleString('vi-VN')}</p><p className="text-figures text-2xl font-semibold text-ink-900">{money(selection.totalPrice)}</p></div> : <p className="mt-3 text-sm text-ink-500">Chọn một slot trống để xem tổng tiền.</p>}{selection && !hold && <Button className="mt-5 w-full" disabled={loading} onClick={() => void reserve()}>Giữ chỗ 10 phút</Button>}{hold && !booking && <Button className="mt-5 w-full" disabled={loading} onClick={() => void create()}>Tạo booking</Button>}{booking && <div className="mt-5 space-y-4"><SegmentedControl options={[{ value: 'balance', label: 'Số dư' }, { value: 'sepay', label: 'SePay' }]} value={paymentMethod} onChange={setPaymentMethod} /><Button className="w-full" disabled={loading} onClick={() => void pay()}>{paymentMethod === 'balance' ? 'Thanh toán số dư' : 'Tạo mã SePay'}</Button>{sepayCode && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">Mã chuyển khoản: <strong className="text-figures">{sepayCode}</strong></p>}<p className="text-xs text-ink-500">Mã booking: <span className="text-figures">{booking.id}</span></p></div>}{message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}</SurfaceCard></aside>
      </div>
      <Modal open={authOpen} title="Đăng nhập để đặt sân" onClose={() => setAuthOpen(false)}><AuthForm onNavigateAway={() => setAuthOpen(false)} onAuthenticated={() => { setAuthOpen(false); const retry = retryAfterAuth.current; retryAfterAuth.current = null; retry?.(); }} /></Modal>
    </main>
  );
}
