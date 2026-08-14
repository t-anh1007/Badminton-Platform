import { useEffect, useRef } from 'react'
import { Button } from './ui'
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js'
import type { MatchCourt, MatchVenue } from '../lib/matchApi'

export interface QuickMatchProgress {
  elapsedMs: number
  scannedCount: number
  candidateCount: number
  phase: string
}

export interface QuickMatchProposal {
  matchId: string
  openSlots: number
  feePerSlot: string
  startAt: string
  endAt: string
  court: MatchCourt
  venue: MatchVenue
}

export function QuickMatchModal({
  open,
  progress,
  proposal,
  message,
  onCancel,
  onAccept,
}: {
  open: boolean
  progress: QuickMatchProgress
  proposal: QuickMatchProposal | null
  message?: string
  onCancel: () => void
  onAccept: (matchId: string) => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-brand-navy/70 p-4" role="presentation">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-match-title" className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/20 bg-surface shadow-[var(--shadow-raised)]">
        <div className="relative overflow-hidden bg-brand-navy px-6 py-8 text-surface">
          <div aria-hidden className="absolute inset-0 opacity-40">
            <span className="absolute left-[12%] top-8 h-3 w-3 animate-ping rounded-full bg-brand-yellow motion-reduce:animate-none" />
            <span className="absolute right-[18%] top-16 h-2 w-2 animate-ping rounded-full bg-info motion-reduce:animate-none [animation-delay:350ms]" />
            <span className="absolute bottom-8 left-1/2 h-24 w-24 -translate-x-1/2 animate-pulse rounded-full border border-brand-yellow/60 motion-reduce:animate-none" />
          </div>
          <div className="relative">
            <p className="text-caption text-brand-yellow">GHÉP KÈO THỜI GIAN THỰC</p>
            <h2 id="quick-match-title" className="mt-2 text-h2 text-surface">{proposal ? 'Đã tìm thấy kèo phù hợp' : 'Đang tìm đối thủ…'}</h2>
            <p className="mt-2 text-sm text-surface/75">Hệ thống đang quét các kèo còn chỗ; bạn luôn là người quyết định tham gia.</p>
          </div>
        </div>
        <div className="space-y-5 p-6" aria-live="polite">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-canvas p-3"><strong className="text-figures text-lg">{Math.floor(progress.elapsedMs / 1000)}s</strong><span className="block text-caption">Đã tìm</span></div>
            <div className="rounded-xl bg-canvas p-3"><strong className="text-figures text-lg">{progress.scannedCount}</strong><span className="block text-caption">Đã quét</span></div>
            <div className="rounded-xl bg-canvas p-3"><strong className="text-figures text-lg">{progress.candidateCount}</strong><span className="block text-caption">Phù hợp</span></div>
          </div>
          {proposal ? (
            <div className="rounded-2xl border border-line bg-canvas p-4">
              <p className="font-bold text-brand-navy">{proposal.venue.name} · {proposal.court.name}</p>
              <p className="mt-1 text-sm text-ink-500">{formatDateTimeVi(proposal.startAt)} · {formatMoneyVnd(proposal.feePerSlot)}/người</p>
              <div className="mt-4 flex flex-wrap gap-3"><Button onClick={() => onAccept(proposal.matchId)}>Xác nhận tham gia</Button><Button tone="secondary" onClick={onCancel}>Bỏ qua</Button></div>
            </div>
          ) : <Button className="w-full" tone="secondary" onClick={onCancel}>Dừng tìm</Button>}
          {message && <p role="status" className="rounded-xl bg-info-bg p-3 text-sm text-brand-navy">{message}</p>}
        </div>
      </section>
    </div>
  )
}
