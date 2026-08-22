import { Button } from './ui.js'
import { formatMoneyVnd } from '../lib/formatters.js'
import type { BookingSummary } from '../lib/venueBookingApi.js'

function formatBookingRange(startAt: string, endAt: string) {
  const start = new Date(startAt)
  const end = new Date(endAt)
  const date = [start.getUTCDate(), start.getUTCMonth() + 1, start.getUTCFullYear()]
    .map((part, index) => index < 2 ? String(part).padStart(2, '0') : String(part))
    .join('/')
  const time = (value: Date) => `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`
  return `${date} · ${time(start)}–${time(end)}`
}

export function BookingCard({ booking, preview, busy = false, cancellable = true, onPreview, onConfirm, onDismiss }: { booking: BookingSummary; preview: number | null; busy?: boolean; cancellable?: boolean; onPreview: () => void; onConfirm: () => void; onDismiss: () => void }) {
  const cancelled = booking.status === 'cancelled'
  const held = booking.status === 'held'
  const refund = preview === null ? 0 : Number(booking.priceSnapshot) * preview / 100
  return <article className="rounded-xl border border-ink-700/15 p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{booking.court?.venue?.name ?? 'Cơ sở'} — {booking.court?.name ?? 'Sân'}</p><p className="mt-1 text-sm text-ink-500">{formatBookingRange(booking.startAt, booking.endAt)}</p>{held && <p className="mt-1 text-xs font-semibold text-ink-500">Đang giữ chỗ · chưa thanh toán</p>}</div><strong>{formatMoneyVnd(booking.priceSnapshot)}</strong></div>{cancellable && !cancelled && <Button disabled={busy} tone="danger" size="sm" className="mt-3" onClick={held ? onConfirm : onPreview}>{held ? 'Hủy giữ chỗ' : 'Xem mức hoàn'}</Button>}{preview !== null && cancellable && !cancelled && !held && <div className="mt-3 rounded-xl bg-brand-yellow/30 p-3"><p>Bạn sẽ được hoàn {preview}% — {formatMoneyVnd(Math.round(refund))}.</p><div className="mt-2 flex gap-2"><Button disabled={busy} tone="danger" size="sm" onClick={onConfirm}>Xác nhận hủy</Button><Button disabled={busy} tone="secondary" size="sm" onClick={onDismiss}>Giữ booking</Button></div></div>}</article>
}
