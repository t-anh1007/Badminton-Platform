import { useEffect, useState } from 'react';
import {
  cancelMyBooking,
  cancelProviderBooking,
  changeBookingCourt,
  getBookingDetail,
  getMyUpcomingBookings,
  getReplacementCourts,
  type BookingSummary,
} from '../lib/venueBookingApi';
import { useSession } from '../session/SessionProvider';
import { Button, SurfaceCard, TextInput } from './ui';
import { BookingCard } from './BookingCard.js';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export function BookingCancellationPanel() {
  const { session } = useSession();
  const isProvider = session?.roles.includes('provider') ?? false;
  const userId = session?.userId;
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [message, setMessage] = useState('Đăng nhập để tải booking thật.');
  const [providerBookingId, setProviderBookingId] = useState('');
  const [replacementCourtId, setReplacementCourtId] = useState('');
  const [providerReason, setProviderReason] = useState('');
  const [pendingCancellation, setPendingCancellation] = useState<{ booking: BookingSummary; refundPercent: number } | null>(null);

  async function loadBookings() {
    try {
      const result = await getMyUpcomingBookings();
      setBookings(result);
      setMessage(result.length === 0 ? 'Bạn chưa có booking sắp tới.' : '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không tải được booking.');
    }
  }

  useEffect(() => {
    if (userId) void loadBookings();
  }, [userId]);

  async function previewCancellation(booking: BookingSummary) {
    try {
      const detail = await getBookingDetail(booking.id);
      setPendingCancellation({ booking, refundPercent: detail.expectedRefundPercent });
      setMessage('Kiểm tra số tiền hoàn bên dưới rồi xác nhận hủy.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể xem mức hoàn.');
    }
  }

  async function confirmCancellation() {
    if (!pendingCancellation) return;
    try {
      const result = await cancelMyBooking(pendingCancellation.booking.id);
      setPendingCancellation(null);
      await loadBookings();
      setMessage(`Đã hủy booking và yêu cầu hoàn ${result.refundPercent}%.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể hủy booking.');
    }
  }

  async function findReplacement() {
    try {
      const result = await getReplacementCourts(providerBookingId.trim());
      setMessage(result.courts.length === 0
        ? 'Không còn sân con trống; chỉ có thể hủy và hoàn 100%.'
        : `Sân trống: ${result.courts.map((court) => `${court.name} (${court.id})`).join(', ')}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không tải được sân thay thế.');
    }
  }

  async function changeCourt() {
    try {
      await changeBookingCourt(providerBookingId.trim(), replacementCourtId.trim());
      setMessage('Đã chuyển booking sang sân con mới; người chơi sẽ thấy ghi chú thay đổi.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể đổi sân.');
    }
  }

  async function cancelAsProvider() {
    try {
      await cancelProviderBooking(providerBookingId.trim(), providerReason.trim());
      setMessage('Đã hủy do lỗi phía sân và yêu cầu hoàn 100%.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể hủy booking.');
    }
  }

  return (
    <section className="mt-14 grid gap-6 lg:grid-cols-2" aria-label="Quản lý booking G5">
      <SurfaceCard className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-h2 !text-2xl">Booking của tôi</h2>
          <Button type="button" onClick={() => void loadBookings()} size="sm">Tải lại</Button>
        </div>
        <div className="space-y-3">
          {bookings.map((booking) => <BookingCard key={booking.id} booking={booking} preview={pendingCancellation?.booking.id === booking.id ? pendingCancellation.refundPercent : null} onPreview={() => void previewCancellation(booking)} onConfirm={() => void confirmCancellation()} onDismiss={() => setPendingCancellation(null)} />)}
        </div>
        <p className="text-body mt-4 text-ink-900/60">Hệ thống luôn hiển thị số tiền hoàn trước bước Xác nhận hủy.</p>
      </SurfaceCard>

      <div className={isProvider ? 'rounded-2xl bg-brand-navy p-6 text-surface shadow-[var(--shadow-card)]' : 'hidden'}>
        <h2 className="text-h2 !text-2xl">Quản lý sự cố phía sân</h2>
        <p className="text-body mt-2 text-surface/70">Đổi sân con cùng cơ sở hoặc hủy kèm hoàn 100%.</p>
        <div className="mt-4 grid gap-3">
          <TextInput value={providerBookingId} onChange={(event) => setProviderBookingId(event.target.value)} placeholder="Mã booking" />
          <div className="flex gap-2">
            <Button type="button" onClick={() => void findReplacement()} size="sm">Tìm sân trống</Button>
          </div>
          <TextInput value={replacementCourtId} onChange={(event) => setReplacementCourtId(event.target.value)} placeholder="Mã sân con thay thế" /><Button tone="secondary" type="button" onClick={() => void changeCourt()}>Đổi sân con</Button><TextInput value={providerReason} onChange={(event) => setProviderReason(event.target.value)} placeholder="Lý do hủy bắt buộc" /><Button tone="danger" type="button" onClick={() => void cancelAsProvider()}>Hủy và hoàn 100%</Button>
        </div>
      </div>
      <p role="status" className="text-body lg:col-span-2">{message}</p>
    </section>
  );
}
