import { useEffect, useRef, useState } from 'react'
import { createBookingSepayIntent, payBookingBalance } from '../lib/financeApi.js'
import { waitForBookingTerminal, type BookingSummary } from '../lib/venueBookingApi.js'
import { Button, SegmentedControl } from './ui.js'

export type PaymentPhase = 'selecting' | 'creating' | 'paying' | 'confirming' | 'confirmed' | 'expired' | 'failed'
type Detail = { booking: BookingSummary; expectedRefundPercent: number; courtChangeNote: string | null }

export function BookingPaymentPanel({ bookingId, holdExpiresAt, onConfirmed, onRecover }: { bookingId: string; holdExpiresAt: string; onConfirmed: (detail: Detail) => void; onRecover: () => void }) {
  const [method, setMethod] = useState<'balance' | 'sepay'>('balance')
  const [phase, setPhase] = useState<PaymentPhase>('selecting')
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(holdExpiresAt).getTime() - Date.now()))
  const [message, setMessage] = useState('')
  const recovered = useRef(false)
  useEffect(() => {
    const check = async () => {
      if (Date.now() < new Date(holdExpiresAt).getTime()) return
      setRemaining(0)
      setPhase('expired')
      setMessage('Lượt giữ chỗ đã hết hạn hoặc đã bị hủy. Hãy chọn lại slot.')
      const result = await waitForBookingTerminal(bookingId, { timeoutMs: 0 })
      if (result.booking.terminalStatus === 'confirmed') { setPhase('confirmed'); onConfirmed(result) }
    }
    void check()
    const timer = window.setInterval(() => {
      const next = Math.max(0, new Date(holdExpiresAt).getTime() - Date.now())
      setRemaining(next)
      if (next === 0) { window.clearInterval(timer); void check() }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [bookingId, holdExpiresAt, onConfirmed])
  const pay = async () => {
    setPhase('paying'); setMessage('')
    try {
      if (method === 'balance') await payBookingBalance(bookingId)
      else { const intent = await createBookingSepayIntent(bookingId); setMessage(`Chuyển khoản theo mã ${intent.matchCode}; đang chờ xác nhận.`) }
      setPhase('confirming')
      const result = await waitForBookingTerminal(bookingId)
      if (result.booking.terminalStatus === 'confirmed') { setPhase('confirmed'); onConfirmed(result); return }
      setPhase('expired'); setMessage('Lượt giữ chỗ đã hết hạn hoặc đã bị hủy. Hãy chọn lại slot.')
    } catch (error) { setPhase('failed'); setMessage(error instanceof Error ? error.message : 'Không thể xác nhận thanh toán.') }
  }
  const recover = () => { if (!recovered.current) { recovered.current = true; onRecover() } }
  const disabled = phase === 'paying' || phase === 'confirming' || phase === 'expired'
  return <div className="mt-5 space-y-4" aria-live="polite">
    <p className="text-sm text-ink-500">Giữ chỗ còn {Math.floor(remaining / 60000).toString().padStart(2, '0')}:{Math.floor(remaining % 60000 / 1000).toString().padStart(2, '0')}</p>
    <SegmentedControl options={[{ value: 'balance', label: 'Số dư' }, { value: 'sepay', label: 'SePay' }]} value={method} onChange={setMethod} />
    <Button className="w-full" disabled={disabled} onClick={() => void pay()}>{phase === 'confirming' ? 'Đang xác nhận…' : method === 'balance' ? 'Thanh toán số dư' : 'Tạo mã SePay'}</Button>
    {message && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    {phase === 'expired' && <Button tone="secondary" className="w-full" onClick={recover}>Chọn lại slot</Button>}
  </div>
}
