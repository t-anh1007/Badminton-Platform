import { useState } from 'react'
import { Button } from './ui.js'
import { formatDateVi, formatMoneyVnd, formatTimeVi } from '../lib/formatters.js'
import type { BookingSummary } from '../lib/venueBookingApi.js'

function formatBookingRange(startAt: string, endAt: string) {
  return `${formatDateVi(startAt)} · ${formatTimeVi(startAt)}–${formatTimeVi(endAt)}`
}

export function BookingCard({ booking, preview, busy = false, cancellable = true, onPreview, onConfirm, onDismiss }: { booking: BookingSummary; preview: number | null; busy?: boolean; cancellable?: boolean; onPreview: () => void; onConfirm: () => void; onDismiss: () => void }) {
  const [showDetails, setShowDetails] = useState(false)
  const cancelled = booking.status === 'cancelled'
  const held = booking.status === 'held'
  const refund = preview === null ? 0 : Number(booking.priceSnapshot) * preview / 100
  return <article className="rounded-xl border border-ink-700/15 p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{booking.court?.venue?.name ?? 'Cơ sở'} — {booking.court?.name ?? 'Sân'}</p><p className="mt-1 text-sm text-ink-500">{formatBookingRange(booking.startAt, booking.endAt)}</p>{held && <p className="mt-1 text-xs font-semibold text-ink-500">{booking.matchDepositPaid ? 'Đang giữ chỗ · đã đặt cọc' : 'Đang giữ chỗ · chưa thanh toán'}</p>}</div><strong>{formatMoneyVnd(booking.priceSnapshot)}</strong></div><div className="mt-3 flex flex-wrap gap-2"><Button tone="secondary" size="sm" aria-expanded={showDetails} onClick={() => setShowDetails((visible) => !visible)}>{showDetails ? 'Ẩn chi tiết sân' : 'Xem chi tiết sân'}</Button>{cancellable && !cancelled && <Button disabled={busy} tone="danger" size="sm" onClick={held ? onConfirm : onPreview}>{held ? 'Hủy giữ chỗ' : 'Xem mức hoàn'}</Button>}</div>{showDetails && <div className="mt-3 rounded-xl bg-ink-50 p-3 text-sm"><p><span className="text-ink-500">Cơ sở:</span> {booking.court?.venue?.name ?? 'Chưa có thông tin'}</p><p className="mt-1"><span className="text-ink-500">Địa chỉ:</span> {booking.court?.venue?.address ?? 'Chưa có thông tin'}</p><p className="mt-1"><span className="text-ink-500">Sân:</span> {booking.court?.name ?? 'Chưa có thông tin'}</p><p className="mt-1"><span className="text-ink-500">Khung giờ đã đặt:</span> {formatBookingRange(booking.startAt, booking.endAt)}</p></div>}{preview !== null && cancellable && !cancelled && !held && <div className="mt-3 rounded-xl bg-brand-yellow/30 p-3"><p>Bạn sẽ được hoàn {preview}% — {formatMoneyVnd(Math.round(refund))}.</p><div className="mt-2 flex gap-2"><Button disabled={busy} tone="danger" size="sm" onClick={onConfirm}>Xác nhận hủy</Button><Button disabled={busy} tone="secondary" size="sm" onClick={onDismiss}>Giữ booking</Button></div></div>}</article>
}
