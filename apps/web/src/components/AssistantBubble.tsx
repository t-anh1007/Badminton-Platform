import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../session/SessionProvider.js'
import { Icon } from './Icon'
import {
  sendPlayerMessage,
  type AiMatchSuggestion,
  type AssistantReply,
  type AssistantSource,
  type PlayerLocation,
} from '../lib/assistantApi.js'

interface BubbleMessage {
  id: string
  role: 'user' | 'assistant'
  body: string
  at: number
  fallback?: boolean
  sources?: AssistantSource[]
  actionPath?: string
  suggestions?: AiMatchSuggestion[]
}

const GREETING: BubbleMessage = {
  id: 'greeting',
  role: 'assistant',
  body: 'Chào bạn 👋 Mình là trợ lý CourtIn. Mình có thể gợi ý kèo hợp trình độ, tìm sân trống gần bạn, xem lượt đặt sân, kèo, ví, trình độ của bạn và giải đáp chính sách.',
  at: 0,
}

const QUICK_REPLIES: Array<{ label: string; text: string }> = [
  { label: 'Gợi ý kèo tối nay', text: 'Gợi ý kèo tối nay cho tôi' },
  { label: 'Sân trống gần tôi', text: 'Sân nào gần tôi còn trống tối nay?' },
  { label: 'Số dư ví của tôi', text: 'Số dư ví của tôi bao nhiêu?' },
  { label: 'Chính sách hủy sân', text: 'Chính sách hủy sân thế nào?' },
]

const clock = (at: number) => new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
const money = (value: string) => `${Number(value).toLocaleString('vi-VN')}đ`
const matchTime = (startAt: string) => new Date(startAt).toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Vị trí chỉ để tính khoảng cách tới sân; người chơi từ chối thì bỏ qua (không lỗi). */
function readLocation(): Promise<PlayerLocation | undefined> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(undefined),
      { timeout: 12_000, maximumAge: 30 * 60_000, enableHighAccuracy: false },
    )
  })
}

export function AssistantBubble() {
  const { session } = useSession()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<BubbleMessage[]>([GREETING])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const locationRef = useRef<Promise<PlayerLocation | undefined> | null>(null)
  const lookRef = useRef<HTMLSpanElement>(null)
  const [hopping, setHopping] = useState(false)
  // Lời chào trên đầu mascot; người dùng tắt thì nhớ trong phiên (tab) hiện tại.
  const [showGreeting, setShowGreeting] = useState(() => {
    try { return window.sessionStorage.getItem('courtin.mascotGreetingHidden') !== '1' } catch { return true }
  })
  const dismissGreeting = () => {
    setShowGreeting(false)
    try { window.sessionStorage.setItem('courtin.mascotGreetingHidden', '1') } catch { /* bộ nhớ trình duyệt bị chặn: chỉ ẩn tạm */ }
  }

  // Mascot dõi theo chuột: nghiêng/quay 3D về phía con trỏ. Tắt khi người dùng bật giảm chuyển động.
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const onMove = (event: PointerEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const target = lookRef.current
        if (!target) return
        const box = target.getBoundingClientRect()
        const nx = Math.max(-1, Math.min(1, (event.clientX - (box.left + box.width / 2)) / 400))
        const ny = Math.max(-1, Math.min(1, (event.clientY - (box.top + box.height / 2)) / 300))
        target.style.transform = `rotateY(${nx * 24}deg) rotateX(${-ny * 16}deg) rotate(${nx * 4}deg) translate(${nx * 4}px, ${ny * 3}px)`
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame) }
  }, [])

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    const stream = streamRef.current
    if (stream && typeof stream.scrollTo === 'function') stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open])

  if (!session || session.activeRole !== 'player') return null

  const close = () => {
    setOpen(false)
    requestAnimationFrame(() => trigger.current?.focus())
  }

  // Bấm mascot: bật nhảy trước rồi mới mở khung chat; đang mở thì đóng ngay.
  const onMascotClick = () => {
    if (open) return close()
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return setOpen(true)
    setHopping(true)
    window.setTimeout(() => setOpen(true), 500)
  }

  const send = async (text: string) => {
    const body = text.trim()
    if (!body || sending) return
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', body, at: Date.now() }])
    setDraft('')
    setSending(true)
    try {
      // Hỏi quyền vị trí một lần cho cả phiên chat.
      locationRef.current ??= readLocation()
      const reply: AssistantReply = await sendPlayerMessage(body, await locationRef.current)
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        body: reply.answer,
        at: Date.now(),
        fallback: reply.fallback,
        sources: reply.sources,
        actionPath: reply.actionPath,
        suggestions: reply.suggestions,
      }])
    } catch {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        body: 'Trợ lý đang bận, bạn thử lại sau giây lát nhé.',
        at: Date.now(),
        fallback: true,
      }])
    } finally {
      setSending(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void send(draft)
  }

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send(draft)
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {open && (
        <section
          role="dialog"
          aria-label="Trợ lý CourtIn"
          onKeyDown={(event) => { if (event.key === 'Escape') close() }}
          className="mb-3 flex h-[560px] max-h-[calc(100vh-6rem)] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-raised)]"
        >
          <header className="flex items-center gap-3 border-b border-line bg-brand-navy px-4 py-3 text-surface">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-brand-yellow text-brand-navy"><Icon name="chat" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold leading-tight">Trợ lý CourtIn</p>
              <p className="flex items-center gap-1.5 text-xs text-surface/80"><span aria-hidden className="h-2 w-2 rounded-full bg-green-400" />Trực tuyến · phản hồi ngay</p>
            </div>
            <button type="button" onClick={close} aria-label="Đóng trợ lý" className="grid h-9 w-9 place-items-center rounded-full text-surface/80 hover:bg-white/10 hover:text-surface">×</button>
          </header>

          <div ref={streamRef} className="flex-1 space-y-3 overflow-y-auto bg-canvas/60 px-3 py-4" aria-live="polite" aria-label="Nội dung trò chuyện">
            {messages.map((message) => <MessageBubble key={message.id} message={message} onClose={close} />)}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface px-4 py-3 shadow-sm" aria-label="Trợ lý đang soạn">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ink-300 [animation-delay:-0.2s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ink-300 [animation-delay:-0.1s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ink-300" />
                </div>
              </div>
            )}
          </div>

          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 border-t border-line bg-surface px-3 py-2">
              {QUICK_REPLIES.map((quick) => (
                <button
                  key={quick.label}
                  type="button"
                  disabled={sending}
                  onClick={() => void send(quick.text)}
                  className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-brand-navy hover:text-brand-navy disabled:opacity-50"
                >
                  {quick.label}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="border-t border-line bg-surface p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                aria-label="Nhắn cho trợ lý CourtIn"
                rows={1}
                value={draft}
                maxLength={1000}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Nhập tin nhắn…"
                className="max-h-28 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-navy focus:outline-none focus:ring-4 focus:ring-green-100"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Gửi tin nhắn"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-yellow text-brand-navy transition hover:bg-brand-yellow-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" /></svg>
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] leading-tight text-ink-400">Trợ lý không tự thực hiện hành động; mọi thao tác bạn tự xác nhận.</p>
          </form>
        </section>
      )}

      {!open && showGreeting && (
        <div className="mascot-greet relative mb-1 mr-3 rounded-2xl rounded-br-sm border border-brand-yellow/60 bg-surface py-2 pl-3.5 pr-8 text-sm font-semibold text-brand-navy shadow-[var(--shadow-raised)]">
          <p aria-hidden>Xin chào! Tôi có thể giúp gì cho bạn? <span aria-hidden>👋</span></p>
          <button
            type="button"
            onClick={dismissGreeting}
            aria-label="Ẩn lời chào"
            className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-base leading-none text-ink-400 hover:bg-canvas hover:text-brand-navy"
          >
            ×
          </button>
          <span aria-hidden className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-brand-yellow/60 bg-surface" />
        </div>
      )}
      <button
        ref={trigger}
        type="button"
        aria-label={open ? 'Thu gọn trợ lý AI' : 'Mở trợ lý AI'}
        aria-expanded={open}
        onClick={onMascotClick}
        onAnimationEnd={() => setHopping(false)}
        className={`relative h-[86px] w-[104px] cursor-pointer border-0 bg-transparent p-0 [perspective:400px] drop-shadow-[0_8px_10px_rgb(21_68_108_/_28%)] focus-visible:rounded-2xl focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow ${hopping ? 'mascot-hop' : 'mascot-idle'}`}
      >
        <span ref={lookRef} className="mascot-look block h-full w-full [transform-style:preserve-3d]">
          <img src="/logo.png" alt="" aria-hidden="true" draggable={false} className="pointer-events-none h-full w-full select-none object-contain" />
        </span>
        {open && (
          <span aria-hidden className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-brand-navy text-xs text-surface shadow">×</span>
        )}
      </button>
    </div>
  )
}

function MessageBubble({ message, onClose }: { message: BubbleMessage; onClose: () => void }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm ${isUser ? 'rounded-br-md bg-brand-navy text-surface' : 'rounded-bl-md bg-surface text-ink-800'}`}>
        <p className="whitespace-pre-wrap">{message.body}</p>

        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.suggestions.map((item) => (
              <Link
                key={item.matchId}
                to={`/matches/${item.matchId}`}
                onClick={onClose}
                className="block rounded-xl border border-line bg-canvas p-2.5 text-ink-800 hover:border-brand-navy"
              >
                <strong className="block text-sm">{item.match.venue.name} · {item.match.court.name}</strong>
                <span className="block text-xs text-ink-500">{item.match.venue.address}{item.distanceKm != null ? ` · cách ${item.distanceKm} km` : ''}</span>
                <span className="mt-1 block text-xs text-ink-700">
                  {matchTime(item.match.startAt)} · {money(item.match.feePerSlot)}/suất · còn {item.match.openSlots} chỗ
                </span>
                {item.memberSummary && <span className="block text-xs text-ink-700">Trong kèo: {item.memberSummary}</span>}
                <span className="mt-0.5 block text-xs text-ink-500">Điểm phù hợp {Math.round(item.score)} · {item.explanation}</span>
              </Link>
            ))}
          </div>
        )}

        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Nguồn trả lời">
            {message.sources.map((source) => (
              <span key={source.id} className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] text-ink-500">{source.title}</span>
            ))}
          </div>
        )}

        {message.actionPath && (
          <Link
            to={message.actionPath}
            onClick={onClose}
            className="mt-2 inline-flex rounded-full border border-brand-navy px-3 py-1 text-xs font-semibold text-brand-navy hover:bg-green-50"
          >
            Mở trang để xem và tự xác nhận
          </Link>
        )}

        {message.fallback && <p className="mt-1.5 text-[11px] font-semibold text-warning">Nguồn AI tạm thời chưa sẵn sàng</p>}
      </div>
      {message.at > 0 && <span className="mt-1 px-1 text-[11px] text-ink-400">{clock(message.at)}</span>}
    </div>
  )
}
