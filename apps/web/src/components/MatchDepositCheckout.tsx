import { useEffect, useRef, useState } from 'react'
import { createMatchOrganizerContributionSepayIntent, payMatchOrganizerContributionBalance, type SepayIntent } from '../lib/financeApi.js'
import { formatMoneyVnd } from '../lib/formatters.js'
import { waitForMatchOpen } from '../lib/matchApi.js'
import { SepayPayBox } from './SepayPayBox.js'
import { Button, SelectInput } from './ui.js'

type Phase = 'selecting' | 'paying' | 'confirming' | 'expired' | 'failed'

export function MatchDepositCheckout({ matchId, fullPrice, holdExpiresAt, onPaid, onExpired }: { matchId: string; fullPrice: string; holdExpiresAt: string; onPaid: (matchId: string) => void; onExpired: () => void }) {
  const [method, setMethod] = useState<'balance' | 'sepay'>('balance')
  const [phase, setPhase] = useState<Phase>('selecting')
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(holdExpiresAt).getTime() - Date.now()))
  const [error, setError] = useState('')
  const [sepay, setSepay] = useState<SepayIntent | null>(null)
  const expired = useRef(false)
  const mounted = useRef(true)
  const phaseRef = useRef<Phase>('selecting')
  const deposit = (BigInt(fullPrice) / 2n).toString()

  const updatePhase = (next: Phase) => { phaseRef.current = next; setPhase(next) }

  useEffect(() => () => { mounted.current = false }, [])

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, new Date(holdExpiresAt).getTime() - Date.now())
      setRemaining(next)
      if (next === 0 && !expired.current && phaseRef.current !== 'paying' && phaseRef.current !== 'confirming') {
        expired.current = true
        updatePhase('expired')
        onExpired()
      }
    }
    tick()
    const timer = window.setInterval(tick, 1_000)
    return () => window.clearInterval(timer)
  }, [holdExpiresAt, onExpired])

  const pay = async () => {
    updatePhase('paying'); setError('')
    try {
      if (method === 'balance') await payMatchOrganizerContributionBalance(matchId)
      else setSepay(await createMatchOrganizerContributionSepayIntent(matchId))
      if (!mounted.current || expired.current) return
      updatePhase('confirming')
      if (method === 'sepay') {
        const intervalMs = 2_500
        const remainingMs = Math.max(0, new Date(holdExpiresAt).getTime() - Date.now())
        await waitForMatchOpen(matchId, { intervalMs, attempts: Math.max(1, Math.ceil(remainingMs / intervalMs)) })
      } else {
        await waitForMatchOpen(matchId)
      }
      if (mounted.current && !expired.current) onPaid(matchId)
    } catch (caught) {
      if (!mounted.current || expired.current) return
      updatePhase('failed')
      setError(caught instanceof Error ? caught.message : 'Không thể xác nhận khoản cọc.')
    }
  }

  const disabled = phase === 'paying' || phase === 'confirming' || phase === 'expired'
  return <div className="mt-5 space-y-4" aria-live="polite">
    <div className="rounded-xl bg-canvas p-4 text-sm text-ink-600">
      <div className="flex justify-between gap-3"><span>Giá sân</span><strong className="text-figures text-ink-900">{formatMoneyVnd(fullPrice)}</strong></div>
      <div className="mt-2 flex justify-between gap-3"><span className="font-semibold text-ink-900">Cọc tạo kèo (50%)</span><strong className="text-figures text-brand-navy">{formatMoneyVnd(deposit)}</strong></div>
      <p className="mt-3">Khoản cọc giữ sân và mở kèo đơn tìm đối thủ. Đối thủ thanh toán 50% còn lại.</p>
      <p className="mt-1">Nếu không tìm được đối trước hạn, tiền cọc được hoàn vào ví của bạn.</p>
    </div>
    <p className="text-sm text-ink-500">Thời gian thanh toán còn {Math.floor(remaining / 60_000).toString().padStart(2, '0')}:{Math.floor((remaining % 60_000) / 1_000).toString().padStart(2, '0')}</p>
    <label className="block text-sm font-medium">Phương thức thanh toán cọc<SelectInput className="mt-1" value={method} disabled={disabled} onChange={(event) => setMethod(event.target.value as 'balance' | 'sepay')}><option value="balance">Số dư</option><option value="sepay">SePay</option></SelectInput></label>
    <Button className="w-full" disabled={disabled} onClick={() => void pay()}>{phase === 'confirming' ? 'Đang xác nhận…' : method === 'balance' ? 'Thanh toán số dư' : 'Tạo mã SePay'}</Button>
    {sepay && <div className="rounded-xl bg-green-50 p-3"><SepayPayBox payment={sepay.payment} /></div>}
    {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
  </div>
}
