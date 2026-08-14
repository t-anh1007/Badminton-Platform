import { Button } from './ui.js'
import { formatDateTimeVi } from '../lib/formatters.js'
import type { BookingSummary } from '../lib/venueBookingApi.js'
export function BookingCard({ booking, preview, busy = false, cancellable = true, onPreview, onConfirm, onDismiss }: { booking: BookingSummary; preview: number | null; busy?: boolean; cancellable?: boolean; onPreview: () => void; onConfirm: () => void; onDismiss: () => void }) {
  const cancelled = booking.status === 'cancelled'
  const refund = preview === null ? 0 : Number(booking.priceSnapshot) * preview / 100
  return <article className="rounded-xl border border-ink-700/15 p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{booking.court?.venue?.name ?? 'Cơ sở'} — {booking.court?.name ?? 'Sân'}</p><p className="mt-1 text-sm text-ink-500">{formatDateTimeVi(booking.startAt)}</p></div><strong>{Number(booking.priceSnapshot).toLocaleString('vi-VN')}₫</strong></div>{cancellable && !cancelled && <Button disabled={busy} tone="danger" size="sm" className="mt-3" onClick={onPreview}>Xem mức hoàn</Button>}{preview !== null && cancellable && !cancelled && <div className="mt-3 rounded-xl bg-brand-yellow/30 p-3"><p>Bạn sẽ được hoàn {preview}% — {refund.toLocaleString('vi-VN')}₫.</p><div className="mt-2 flex gap-2"><Button disabled={busy} tone="danger" size="sm" onClick={onConfirm}>Xác nhận hủy</Button><Button disabled={busy} tone="secondary" size="sm" onClick={onDismiss}>Giữ booking</Button></div></div>}</article>
}
