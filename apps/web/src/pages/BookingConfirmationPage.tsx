import { Link, Navigate, useLocation } from 'react-router-dom'
import type { BookingSummary } from '../lib/venueBookingApi.js'
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js'
import { Button, SurfaceCard } from '../components/ui.js'

export function BookingConfirmationPage() {
  const state = useLocation().state as { booking?: BookingSummary } | null
  const booking = state?.booking
  if (!booking || booking.terminalStatus !== 'confirmed') return <Navigate to="/venues" replace />
  return <main className="page-container py-10"><SurfaceCard className="mx-auto max-w-xl text-center"><p className="text-sm font-bold text-success">THANH TOÁN HOÀN TẤT</p><h1 className="mt-2 text-h2">Đặt sân đã được xác nhận</h1><p className="mt-3 text-ink-500">{booking.court?.venue?.name ?? 'Cơ sở'} · {booking.court?.name ?? 'Sân'}</p><p className="text-ink-500">{formatDateTimeVi(booking.startAt)}–{formatDateTimeVi(booking.endAt)}</p><strong className="mt-4 block text-2xl">{formatMoneyVnd(booking.priceSnapshot)}</strong><div className="mt-6 flex flex-wrap justify-center gap-3"><Link to="/profile"><Button>Xem đặt sân của tôi</Button></Link><Link to={`/matches?bookingId=${encodeURIComponent(booking.id)}`}><Button tone="secondary">Tìm kèo từ sân này</Button></Link></div></SurfaceCard></main>
}
