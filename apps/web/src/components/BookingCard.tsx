import { Button } from './ui.js'
import type { BookingSummary } from '../lib/venueBookingApi.js'
export function BookingCard({ booking, preview, onPreview, onConfirm, onDismiss }: { booking: BookingSummary; preview: number | null; onPreview: () => void; onConfirm: () => void; onDismiss: () => void }) {
  const cancelled = booking.status === 'cancelled'
  return <article className="rounded-xl border border-ink-700/15 p-4"><p className="font-semibold">{booking.court?.venue?.name ?? 'Cơ sở'} — {booking.court?.name ?? 'Sân'}</p>{!cancelled && <Button tone="danger" size="sm" className="mt-3" onClick={onPreview}>Xem mức hoàn</Button>}{preview !== null && !cancelled && <div className="mt-3"><p>Bạn sẽ được hoàn {preview}%.</p><Button tone="danger" size="sm" onClick={onConfirm}>Xác nhận hủy</Button><Button tone="secondary" size="sm" onClick={onDismiss}>Giữ booking</Button></div>}</article>
}
