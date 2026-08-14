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
  const [courts, setCourts] = useState<Array<{ id: string; name: string }>>([])
  const [courtId, setCourtId] = useState('')
  const [entries, setEntries] = useState<Array<{ id: string; courtId: string; kind: 'booking' | 'hold'; startAt: string; endAt: string }>>([])
  const [guest, setGuest] = useState({ name: '', contact: '', startAt: '', endAt: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async (id = venueId, day = parseDate(date)) => {
    if (!id || !day) return
    try {
      const result = await getVenueCalendar(id, day)
      setCourts(result.courts)
      setCourtId((current) => result.courts.some((court) => court.id === current) ? current : (result.courts[0]?.id ?? ''))
      setEntries(result.entries)
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
    if (!day || !courtId || !guest.name || !guest.contact || !guest.startAt || !guest.endAt || busy) {
      setError('Chọn sân con và nhập đủ ngày dd/MM/yyyy cùng thông tin khách.')
      return
    }
    setBusy(true)
    try {
      await createInternalBooking({
        courtId,
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

  return <section><h2 className="text-h2">Lịch sân</h2><select aria-label="Cơ sở" value={venueId} onChange={(event) => { setVenueId(event.target.value); void load(event.target.value) }}>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select><input aria-label="Ngày lịch (dd/MM/yyyy)" placeholder="dd/MM/yyyy" value={date} onChange={(event) => setDate(event.target.value)} onBlur={() => void load()} /><select aria-label="Sân con" value={courtId} onChange={(event) => setCourtId(event.target.value)}>{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select><input aria-label="Tên khách" value={guest.name} onChange={(event) => setGuest({ ...guest, name: event.target.value })} /><input aria-label="Liên hệ khách" value={guest.contact} onChange={(event) => setGuest({ ...guest, contact: event.target.value })} /><input aria-label="Bắt đầu" value={guest.startAt} onChange={(event) => setGuest({ ...guest, startAt: event.target.value })} /><input aria-label="Kết thúc" value={guest.endAt} onChange={(event) => setGuest({ ...guest, endAt: event.target.value })} /><Button disabled={busy || !courtId} onClick={() => void create()}>Tạo booking vãng lai</Button>{entries.map((entry) => <div key={entry.id}>{entry.kind} <Button disabled={busy} size="sm" onClick={() => { setBusy(true); void cancelInternalBooking(entry.id).then(() => load()).catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể hủy booking.')).finally(() => setBusy(false)) }}>Hủy</Button></div>)}{error && <p role="alert">{error}</p>}</section>
}
