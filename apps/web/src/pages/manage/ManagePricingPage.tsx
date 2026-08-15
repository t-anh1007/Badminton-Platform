import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, SurfaceCard } from '../../components/ui'
import { saveBookingRule, savePricing } from '../../lib/venueBookingApi'
import { parseVietnameseDate, toMinutes } from './ManageSchedulePage'

export function validateBookingRule(step: number, min: number, max: number): string | null {
  if (!Number.isInteger(step) || step <= 0 || !Number.isInteger(min) || !Number.isInteger(max)) return 'Bước, tối thiểu và tối đa phải là số nguyên dương.'
  if (min < step || min % step || max < min || max % step) return 'Tối thiểu và tối đa phải chia hết cho bước; tối đa không nhỏ hơn tối thiểu.'
  return null
}

export function ManagePricingPage() {
  const [query] = useSearchParams(); const courtId = query.get('courtId') ?? ''
  const [weekday, setWeekday] = useState(1); const [start, setStart] = useState('08:00'); const [end, setEnd] = useState('22:00'); const [price, setPrice] = useState('100000'); const [effectiveFrom, setEffectiveFrom] = useState('')
  const [step, setStep] = useState('30'); const [min, setMin] = useState('60'); const [max, setMax] = useState('180'); const [busy, setBusy] = useState<'price' | 'rule' | null>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const savePrice = async () => {
    const effectiveDate = parseVietnameseDate(effectiveFrom); const numericPrice = Number(price)
    if (!courtId) return setError('Hãy chọn sân con trước khi cấu hình giá.')
    if (toMinutes(start) >= toMinutes(end)) return setError('Giờ kết thúc phải sau giờ bắt đầu và không được tạo khung chồng lấn.')
    if (!Number.isSafeInteger(numericPrice) || numericPrice <= 0) return setError('Giá phải là số nguyên dương.')
    if (!effectiveDate) return setError('Ngày hiệu lực phải theo dd/MM/yyyy.')
    setBusy('price'); setError(''); setNotice('')
    try { await savePricing(courtId, { effectiveFrom: `${effectiveDate}T00:00:00.000Z`, rules: [{ weekday, startMinute: toMinutes(start), endMinute: toMinutes(end), price: numericPrice }] }); setNotice('Đã lưu bảng giá.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể lưu bảng giá; hãy kiểm tra khung giờ chồng lấn.') }
    finally { setBusy(null) }
  }
  const saveRule = async () => {
    const values = [Number(step), Number(min), Number(max)] as const; const validation = validateBookingRule(...values)
    if (!courtId) return setError('Hãy chọn sân con trước khi cấu hình quy tắc.')
    if (validation) return setError(validation)
    setBusy('rule'); setError(''); setNotice('')
    try { await saveBookingRule(courtId, { stepMinutes: values[0], minDurationMinutes: values[1], maxDurationMinutes: values[2] }); setNotice('Đã lưu quy tắc đặt sân.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể lưu quy tắc đặt sân.') }
    finally { setBusy(null) }
  }
  return <section className="grid max-w-2xl gap-5"><div><h2 className="text-h2">Giá và quy tắc đặt sân</h2><p className="mt-1 text-sm text-ink-500">Mỗi khung giá phải nằm trong giờ hoạt động và không chồng lấn.</p></div><SurfaceCard className="grid gap-3"><h3 className="text-h3">Khung giá</h3><label className="grid gap-1 text-sm">Thứ<select aria-label="Thứ áp dụng giá" value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>{['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'].map((label, day) => <option key={day} value={day}>{label}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Bắt đầu<input aria-label="Giờ bắt đầu giá" type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label><label className="grid gap-1 text-sm">Kết thúc<input aria-label="Giờ kết thúc giá" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div><label className="grid gap-1 text-sm">Giá mỗi giờ<input aria-label="Giá" inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label className="grid gap-1 text-sm">Hiệu lực từ (dd/MM/yyyy)<input aria-label="Ngày hiệu lực" placeholder="dd/MM/yyyy" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label><Button disabled={busy !== null} onClick={() => void savePrice()}>{busy === 'price' ? 'Đang lưu…' : 'Lưu bảng giá'}</Button></SurfaceCard><SurfaceCard className="grid gap-3"><h3 className="text-h3">Giới hạn đặt sân</h3><div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm">Bước phút<input aria-label="Bước phút" inputMode="numeric" value={step} onChange={(event) => setStep(event.target.value)} /></label><label className="grid gap-1 text-sm">Tối thiểu<input aria-label="Tối thiểu" inputMode="numeric" value={min} onChange={(event) => setMin(event.target.value)} /></label><label className="grid gap-1 text-sm">Tối đa<input aria-label="Tối đa" inputMode="numeric" value={max} onChange={(event) => setMax(event.target.value)} /></label></div><p className="text-xs text-ink-500">Tối thiểu/tối đa phải là bội số của bước thời gian.</p><Button disabled={busy !== null} onClick={() => void saveRule()}>{busy === 'rule' ? 'Đang lưu…' : 'Lưu quy tắc'}</Button></SurfaceCard>{error && <p role="alert" className="text-sm text-danger">{error}</p>}{notice && <p role="status" className="text-sm text-green-700">{notice}</p>}</section>
}
