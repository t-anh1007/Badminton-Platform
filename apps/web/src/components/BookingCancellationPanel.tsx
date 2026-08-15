import { useState } from 'react'
import { cancelMyBooking, getBookingDetail, type BookingSummary } from '../lib/venueBookingApi'
import { BookingCard } from './BookingCard.js'

export function BookingCancellationPanel({ bookings, cancellable, onChanged }: { bookings: BookingSummary[]; cancellable: boolean; onChanged: () => Promise<void> }) {
  const [pending, setPending] = useState<{ bookingId: string; refundPercent: number } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const preview = async (booking: BookingSummary) => {
    setBusyId(booking.id); setMessage('')
    try { const detail = await getBookingDetail(booking.id); setPending({ bookingId: booking.id, refundPercent: detail.expectedRefundPercent }) }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Không thể xem mức hoàn.') }
    finally { setBusyId(null) }
  }
  const confirm = async (booking: BookingSummary) => {
    if (pending?.bookingId !== booking.id) return
    setBusyId(booking.id); setMessage('')
    try { const result = await cancelMyBooking(booking.id); setPending(null); await onChanged(); setMessage(`Đã hủy booking và yêu cầu hoàn ${result.refundPercent}%.`) }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Không thể hủy booking.') }
    finally { setBusyId(null) }
  }
  return <section aria-label="Danh sách booking"><div className="space-y-3">{bookings.map((booking) => <BookingCard key={booking.id} booking={booking} cancellable={cancellable} busy={busyId === booking.id} preview={pending?.bookingId === booking.id ? pending.refundPercent : null} onPreview={() => void preview(booking)} onConfirm={() => void confirm(booking)} onDismiss={() => setPending(null)} />)}</div>{message && <p role="status" className="mt-3 text-sm">{message}</p>}</section>
}
