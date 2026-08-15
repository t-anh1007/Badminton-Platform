import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, SurfaceCard } from '../../components/ui'
import { addClosure, saveOperatingHours } from '../../lib/venueBookingApi'

export const toMinutes = (value: string) => { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes }
export function parseVietnameseDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null
}

export function ManageSchedulePage() {
  const [query] = useSearchParams(); const courtId = query.get('courtId') ?? ''
  const [weekday, setWeekday] = useState(1); const [open, setOpen] = useState('08:00'); const [close, setClose] = useState('22:00')
  const [date, setDate] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState<'hours' | 'closure' | null>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const saveHours = async () => {
    if (!courtId) return setError('Hãy chọn sân con trước khi cấu hình lịch.')
    if (toMinutes(open) >= toMinutes(close)) return setError('Giờ đóng phải sau giờ mở.')
    setBusy('hours'); setError(''); setNotice('')
    try { await saveOperatingHours(courtId, { weekday, openMinute: toMinutes(open), closeMinute: toMinutes(close) }); setNotice('Đã lưu giờ hoạt động.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể lưu giờ hoạt động.') }
    finally { setBusy(null) }
  }
  const saveClosure = async () => {
    const iso = parseVietnameseDate(date)
    if (!courtId) return setError('Hãy chọn sân con trước khi thêm ngày đóng.')
    if (!iso) return setError('Ngày đóng phải là ngày hợp lệ theo dd/MM/yyyy.')
    setBusy('closure'); setError(''); setNotice('')
    try { await addClosure(courtId, { date: `${iso}T00:00:00.000Z`, ...(reason.trim() ? { reason: reason.trim() } : {}) }); setNotice('Đã thêm ngày đóng sân.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể thêm ngày đóng.') }
    finally { setBusy(null) }
  }
  return <section className="grid max-w-2xl gap-5"><div><h2 className="text-h2">Lịch hoạt động</h2><p className="mt-1 text-sm text-ink-500">Thời gian được lưu theo phút để đồng bộ chính xác với lưới đặt sân.</p></div><SurfaceCard className="grid gap-3"><h3 className="text-h3">Giờ mở cửa</h3><label className="grid gap-1 text-sm">Thứ<select aria-label="Thứ trong tuần" value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>{['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'].map((label, day) => <option key={day} value={day}>{label}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Giờ mở<input aria-label="Giờ mở" type="time" value={open} onChange={(event) => setOpen(event.target.value)} /></label><label className="grid gap-1 text-sm">Giờ đóng<input aria-label="Giờ đóng" type="time" value={close} onChange={(event) => setClose(event.target.value)} /></label></div><Button disabled={busy !== null} onClick={() => void saveHours()}>{busy === 'hours' ? 'Đang lưu…' : 'Lưu giờ hoạt động'}</Button></SurfaceCard><SurfaceCard className="grid gap-3"><h3 className="text-h3">Ngày đóng sân</h3><label className="grid gap-1 text-sm">Ngày (dd/MM/yyyy)<input aria-label="Ngày đóng sân" placeholder="dd/MM/yyyy" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="grid gap-1 text-sm">Lý do<input aria-label="Lý do đóng sân" value={reason} onChange={(event) => setReason(event.target.value)} /></label><Button disabled={busy !== null} onClick={() => void saveClosure()}>{busy === 'closure' ? 'Đang lưu…' : 'Thêm ngày đóng'}</Button></SurfaceCard>{error && <p role="alert" className="text-sm text-danger">{error}</p>}{notice && <p role="status" className="text-sm text-green-700">{notice}</p>}</section>
}
