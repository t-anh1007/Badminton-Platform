import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { cancelInternalBooking, createInternalBooking, getMyManagedVenues, getVenueCalendar, type ManagedVenue } from '../../lib/venueBookingApi'

const parseDate = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null
}

export function ManageCalendarPage() {
  const [venues, setVenues] = useState<ManagedVenue[]>([])
  const [venueId, setVenueId] = useState('')
  const [date, setDate] = useState('')
  const [entries, setEntries] = useState<Array<{ id: string; courtId: string; kind: 'booking' | 'hold'; startAt: string; endAt: string }>>([])
  const [guest, setGuest] = useState({ name: '', contact: '', startAt: '', endAt: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async (id = venueId, day = parseDate(date)) => {
    if (!id || !day) return
    try {
      setEntries((await getVenueCalendar(id, day)).entries)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải lịch.')
    }
  }

  useEffect(() => {
    void getMyManagedVenues()
      .then((next) => {
        setVenues(next)
        setVenueId(next[0]?.id ?? '')
        setDate(new Date().toLocaleDateString('en-GB'))
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải cơ sở.'))
  }, [])

  const create = async () => {
    const day = parseDate(date)
    if (!day || !guest.name || !guest.contact || !guest.startAt || !guest.endAt || busy) {
      setError('Nhập đủ ngày dd/MM/yyyy và thông tin khách.')
      return
    }
    setBusy(true)
    try {
      await createInternalBooking({
        courtId: entries[0]?.courtId ?? venues.find((venue) => venue.id === venueId)?.courts[0]?.id ?? '',
        startAt: guest.startAt,
        endAt: guest.endAt,
        guestName: guest.name,
        guestContact: guest.contact,
      })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo booking nội bộ.')
    } finally {
      setBusy(false)
    }
  }

  return <section><h2 className="text-h2">Lịch sân</h2><select value={venueId} onChange={(event) => { setVenueId(event.target.value); void load(event.target.value) }}>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select><input aria-label="Ngày lịch (dd/MM/yyyy)" placeholder="dd/MM/yyyy" value={date} onChange={(event) => setDate(event.target.value)} onBlur={() => void load()} /><input aria-label="Tên khách" value={guest.name} onChange={(event) => setGuest({ ...guest, name: event.target.value })} /><input aria-label="Liên hệ khách" value={guest.contact} onChange={(event) => setGuest({ ...guest, contact: event.target.value })} /><input aria-label="Bắt đầu" value={guest.startAt} onChange={(event) => setGuest({ ...guest, startAt: event.target.value })} /><input aria-label="Kết thúc" value={guest.endAt} onChange={(event) => setGuest({ ...guest, endAt: event.target.value })} /><Button disabled={busy} onClick={() => void create()}>Tạo booking vãng lai</Button>{entries.map((entry) => <div key={entry.id}>{entry.kind} <Button disabled={busy} size="sm" onClick={() => { setBusy(true); void cancelInternalBooking(entry.id).then(() => load()).catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể hủy booking.')).finally(() => setBusy(false)) }}>Hủy</Button></div>)}{error && <p role="alert">{error}</p>}</section>
}
