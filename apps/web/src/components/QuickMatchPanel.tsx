import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useNavigate } from 'react-router-dom'
import { Button, SelectInput } from './ui'
import { Icon } from './Icon'
import { useAuthPrompt } from '../layout/AuthPrompt'
import { QuickMatchModal, type QuickMatchProgress, type QuickMatchProposal } from './QuickMatchModal'
import type { SkillTier } from '../lib/matchApi'

const tiers: Array<{ value: SkillTier; label: string }> = [
  { value: 'newcomer', label: 'Mới chơi' },
  { value: 'beginner', label: 'Yếu' },
  { value: 'intermediate', label: 'Trung bình' },
  { value: 'intermediate_plus', label: 'Trung bình khá' },
  { value: 'advanced', label: 'Bán chuyên' },
]
const initialProgress: QuickMatchProgress = { elapsedMs: 0, scannedCount: 0, candidateCount: 0, phase: 'connecting' }

export function QuickMatchPanel() {
  const [skill, setSkill] = useState<SkillTier>('intermediate')
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState(initialProgress)
  const [proposal, setProposal] = useState<QuickMatchProposal | null>(null)
  const [message, setMessage] = useState('')
  const socketRef = useRef<Socket | null>(null)
  const requestIdRef = useRef('')
  const timerRef = useRef<number | null>(null)
  const navigate = useNavigate()
  const promptAuth = useAuthPrompt()

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }
  const disconnect = () => {
    clearTimer()
    socketRef.current?.disconnect()
    socketRef.current = null
  }
  useEffect(() => () => disconnect(), [])

  const stop = () => {
    const requestId = requestIdRef.current
    if (requestId) socketRef.current?.emit('quick_match:stop', { requestId })
    disconnect()
    setOpen(false)
  }

  const find = () => {
    const accessToken = window.localStorage.getItem('accessToken')
    if (!accessToken) {
      promptAuth({ title: 'Đăng nhập để tìm nhanh' })
      return
    }
    disconnect()
    const requestId = window.crypto.randomUUID()
    requestIdRef.current = requestId
    setProgress(initialProgress)
    setProposal(null)
    setMessage('')
    setOpen(true)
    const socket = io(import.meta.env.VITE_MATCHMAKING_WS_URL ?? window.location.origin, { auth: { token: accessToken } })
    socketRef.current = socket
    socket.on('connect', () => socket.emit('quick_match:find', { requestId, skill }))
    socket.on('quick_match:progress', (next: QuickMatchProgress & { requestId: string }) => {
      if (next.requestId === requestId) setProgress(next)
    })
    socket.on('quick_match:proposal', (next: QuickMatchProposal & { requestId: string }) => {
      if (next.requestId !== requestId) return
      clearTimer()
      setProposal(next)
      setProgress((current) => ({ ...current, candidateCount: Math.max(1, current.candidateCount), phase: 'proposal' }))
    })
    socket.on('quick_match:stopped', (event: { requestId: string }) => {
      if (event.requestId === requestId) setMessage('Đã dừng tìm kèo.')
    })
    socket.on('quick_match:joined', (join: { requestId: string; matchId: string }) => {
      if (join.requestId !== requestId) return
      setMessage('Yêu cầu tham gia đã được gửi và đang chờ người tổ chức duyệt.')
      clearTimer()
      window.setTimeout(() => navigate(`/matches/${join.matchId}`), 500)
    })
    socket.on('quick_match:error', (error: { requestId?: string; message?: string }) => {
      if (error.requestId && error.requestId !== requestId) return
      clearTimer()
      setMessage(error.message ?? 'Tìm nhanh đang gián đoạn. Hãy thử lại.')
    })
    socket.on('connect_error', () => {
      clearTimer()
      setMessage('Không thể kết nối Tìm nhanh. Hãy thử lại.')
    })
    timerRef.current = window.setTimeout(() => {
      socket.emit('quick_match:stop', { requestId })
      setMessage('Chưa tìm thấy kèo phù hợp sau 15 giây. Bạn có thể đóng và thử lại.')
    }, 15_000)
  }

  const accept = (matchId: string) => {
    clearTimer()
    socketRef.current?.emit('quick_match:accept', { requestId: requestIdRef.current, matchId })
    setMessage('Đang gửi yêu cầu tham gia…')
  }

  return <><section className="flex flex-col gap-5 rounded-2xl bg-brand-navy p-6 text-surface shadow-[var(--shadow-card)] lg:flex-row lg:items-center lg:justify-between" aria-live="polite">
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/20 px-2.5 py-1 text-[11px] font-extrabold tracking-[0.1em] text-[#ffb3b9]"><span className="h-1.5 w-1.5 rounded-full bg-[#ff5a66]" />TRỰC TIẾP</span>
      <h2 className="mt-2 font-display text-lg font-extrabold">Tìm nhanh một chỗ còn lại</h2>
      <p className="mt-1 text-sm text-surface/75">Ghép bạn vào kèo đang thiếu người. Chỉ tạo yêu cầu khi bạn xác nhận.</p>
    </div>
    <div className="flex shrink-0 flex-col gap-2 sm:flex-row"><SelectInput aria-label="Bậc Tìm nhanh" className="sm:w-52" value={skill} onChange={(event) => setSkill(event.target.value as SkillTier)}>{tiers.map((tier) => <option key={tier.value} value={tier.value}>{tier.label}</option>)}</SelectInput><Button onClick={find} disabled={open}><Icon name="bolt" className="h-4 w-4" />Tìm nhanh</Button></div>
  </section><QuickMatchModal open={open} progress={progress} proposal={proposal} message={message} onCancel={stop} onAccept={accept} /></>
}
