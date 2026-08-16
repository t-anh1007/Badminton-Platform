import { useEffect, useRef, useState } from 'react'
import { createBookingSepayIntent, payBookingBalance, type SepayPayInstruction } from '../lib/financeApi.js'
import { waitForBookingTerminal, type BookingSummary } from '../lib/venueBookingApi.js'
import { Button, SegmentedControl } from './ui.js'
import { SepayPayBox } from './SepayPayBox.js'

export type PaymentPhase = 'selecting' | 'creating' | 'paying' | 'confirming' | 'confirmed' | 'expired' | 'failed'
type Detail = { booking: BookingSummary; expectedRefundPercent: number; courtChangeNote: string | null }

export function BookingPaymentPanel({ bookingId, holdExpiresAt, onConfirmed, onRecover }: { bookingId: string; holdExpiresAt: string; onConfirmed: (detail: Detail) => void; onRecover: () => void }) {
  const [method, setMethod] = useState<'balance' | 'sepay'>('balance')
  const [phase, setPhase] = useState<PaymentPhase>('selecting')
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(holdExpiresAt).getTime() - Date.now()))
  const [message, setMessage] = useState('')
  const [payment, setPayment] = useState<SepayPayInstruction | null>(null)
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
      // Số dư trừ ngay (đồng bộ) nên xác nhận trong vài giây; SePay cần người
      // dùng mở app ngân hàng quét QR rồi chờ webhook, có thể lâu — poll đến khi
      // hết hạn giữ chỗ thay vì bỏ cuộc sau 15s (nếu không UI báo "hết hạn" sớm
      // dù webhook xác thực thành công ngay sau đó).
      let waitOptions: { intervalMs?: number; timeoutMs?: number } = {}
      if (method === 'balance') await payBookingBalance(bookingId)
      else {
        const intent = await createBookingSepayIntent(bookingId); setPayment(intent.payment)
        waitOptions = { intervalMs: 2500, timeoutMs: Math.max(0, new Date(holdExpiresAt).getTime() - Date.now()) }
      }
      setPhase('confirming')
      const result = await waitForBookingTerminal(bookingId, waitOptions)
      if (result.booking.terminalStatus === 'confirmed') { setPhase('confirmed'); onConfirmed(result); return }
      setPhase('expired'); setMessage('Lượt giữ chỗ đã hết hạn hoặc đã bị hủy. Hãy chọn lại slot.')
    } catch (error) { setPhase('failed'); setMessage(error instanceof Error ? error.message : 'Không thể xác nhận thanh toán.') }
  }
  const recover = () => { if (!recovered.current) { recovered.current = true; onRecover() } }
  const disabled = phase === 'paying' || phase === 'confirming' || phase === 'expired'
  return <div className="mt-5 space-y-4" aria-live="polite">
    <p className="text-sm text-ink-500">Giữ chỗ còn {Math.floor(remaining / 60000).toString().padStart(2, '0')}:{Math.floor(remaining % 60000 / 1000).toString().padStart(2, '0')}</p>
    <SegmentedControl options={[{ value: 'balance', label: 'Số dư' }, { value: 'sepay', label: 'SePay' }]} value={method} onChange={(next) => setMethod(next as 'balance' | 'sepay')} />
    <Button className="w-full" disabled={disabled} onClick={() => void pay()}>{phase === 'confirming' ? 'Đang xác nhận…' : method === 'balance' ? 'Thanh toán số dư' : 'Tạo mã SePay'}</Button>
    {payment && <div className="rounded-xl bg-green-50 p-3"><SepayPayBox payment={payment} /></div>}
    {message && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    {phase === 'expired' && <Button tone="secondary" className="w-full" onClick={recover}>Chọn lại slot</Button>}
  </div>
}
