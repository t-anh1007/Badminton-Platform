import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, SelectInput } from './ui'
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
      navigate('/auth')
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

  return <><section className="overflow-hidden rounded-2xl border border-line bg-[linear-gradient(120deg,#edf4f7_0%,#ffffff_70%)] p-5 shadow-[var(--shadow-card)]" aria-live="polite"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><Badge tone="danger">Live</Badge><h2 className="text-h3">Tìm nhanh một chỗ còn lại</h2></div><p className="mt-1 text-sm text-ink-500">Theo dõi tiến trình ghép kèo trực tiếp; chỉ khi bạn xác nhận hệ thống mới tạo yêu cầu chờ duyệt.</p></div><div className="flex flex-col gap-2 sm:flex-row"><SelectInput aria-label="Bậc Tìm nhanh" value={skill} onChange={(event) => setSkill(event.target.value as SkillTier)}>{tiers.map((tier) => <option key={tier.value} value={tier.value}>{tier.label}</option>)}</SelectInput><Button onClick={find} disabled={open}>Tìm nhanh</Button></div></div></section><QuickMatchModal open={open} progress={progress} proposal={proposal} message={message} onCancel={stop} onAccept={accept} /></>
}
