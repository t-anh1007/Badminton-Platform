import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import {
  cancelProviderBooking,
  changeBookingCourt,
  getMyManagedVenues,
  getReplacementCourts,
  getVenueCalendar,
  type ManagedVenue,
} from '../../lib/venueBookingApi'

type IncidentBooking = {
  id: string
  courtId: string
  kind: 'booking' | 'hold'
  startAt: string
  endAt: string
}

const toIsoDate = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null
}

export function ManageIncidentsPage() {
  const [venues, setVenues] = useState<ManagedVenue[]>([])
  const [venueId, setVenueId] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('en-GB'))
  const [bookings, setBookings] = useState<IncidentBooking[]>([])
  const [bookingId, setBookingId] = useState('')
  const [courts, setCourts] = useState<Array<{ id: string; name: string }>>([])
  const [courtId, setCourtId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadBookings = async (nextVenueId = venueId, nextDate = toIsoDate(date)) => {
    if (!nextVenueId || !nextDate) {
      setError('Ngày phải theo định dạng dd/MM/yyyy.')
      return
    }
    try {
      const result = await getVenueCalendar(nextVenueId, nextDate)
      const ownedBookings = result.entries.filter((entry) => entry.kind === 'booking')
      setBookings(ownedBookings)
      setBookingId(ownedBookings[0]?.id ?? '')
      setCourts([])
      setCourtId('')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải booking của cơ sở.')
    }
  }

  useEffect(() => {
    void getMyManagedVenues()
      .then((next) => {
        setVenues(next)
        const firstVenueId = next[0]?.id ?? ''
        setVenueId(firstVenueId)
        return loadBookings(firstVenueId, toIsoDate(date))
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải cơ sở.'))
  }, [])

  const loadReplacementCourts = async () => {
    if (!bookingId) return
    try {
      const result = await getReplacementCourts(bookingId)
      setCourts(result.courts)
      setCourtId(result.courts[0]?.id ?? '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải sân thay thế.')
    }
  }

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
      await loadBookings()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xử lý sự cố.')
    } finally {
      setBusy(false)
    }
  }

  return <section><h2 className="text-h2">Sự cố booking</h2><p>Chọn booking từ lịch của cơ sở bạn quản lý.</p><label>Cơ sở<select value={venueId} onChange={(event) => { setVenueId(event.target.value); void loadBookings(event.target.value) }}>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label><label>Ngày<input aria-label="Ngày sự cố (dd/MM/yyyy)" value={date} onChange={(event) => setDate(event.target.value)} onBlur={() => void loadBookings()} /></label><select aria-label="Booking đã chọn" value={bookingId} onChange={(event) => { setBookingId(event.target.value); setCourts([]); setCourtId('') }}><option value="">Chưa chọn booking</option>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{new Date(booking.startAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}–{new Date(booking.endAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</option>)}</select><Button disabled={!bookingId || busy} onClick={() => void loadReplacementCourts()}>Tải sân thay thế</Button><select aria-label="Sân thay thế" value={courtId} onChange={(event) => setCourtId(event.target.value)}>{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select><Button disabled={busy || !bookingId || !courtId} onClick={() => void run(() => changeBookingCourt(bookingId, courtId))}>Đổi sân</Button><input aria-label="Lý do lỗi phía sân" value={reason} onChange={(event) => setReason(event.target.value)} /><Button disabled={busy || !bookingId || !reason.trim()} onClick={() => void run(() => cancelProviderBooking(bookingId, reason.trim()))}>Hủy do lỗi phía sân</Button>{error && <p role="alert">{error}</p>}</section>
}
