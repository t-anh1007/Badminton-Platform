import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../session/SessionProvider.js'
import {
  sendMatchSuggestionMessage,
  sendSupportMessage,
  type AiMatchSuggestion,
  type AssistantReply,
  type AssistantSource,
} from '../lib/assistantApi.js'

type Intent = 'support' | 'match'

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
  body: 'Chào bạn 👋 Mình là trợ lý CourtIn. Hỏi mình về chính sách, booking của bạn, hoặc nhờ mình gợi ý kèo phù hợp nhé.',
  at: 0,
}

const QUICK_REPLIES: Array<{ label: string; text: string; intent: Intent }> = [
  { label: 'Tìm kèo phù hợp', text: 'Gợi ý kèo phù hợp với tôi', intent: 'match' },
  { label: 'Chính sách hủy sân', text: 'Chính sách hủy sân thế nào?', intent: 'support' },
  { label: 'Booking gần nhất của tôi', text: 'Booking gần nhất của tôi khi nào?', intent: 'support' },
]

const clock = (at: number) => new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

/** Đoán ý định để composer tự chọn nguồn: tìm kèo (F-02) hay hỏi chính sách. */
function detectIntent(text: string): Intent {
  return /(tìm|gợi ý|kiếm|ghép)\s*kèo|kèo\s*(nào|phù hợp)|đối thủ|đánh đôi/iu.test(text) ? 'match' : 'support'
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

  const send = async (text: string, intent: Intent = detectIntent(text)) => {
    const body = text.trim()
    if (!body || sending) return
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', body, at: Date.now() }])
    setDraft('')
    setSending(true)
    try {
      const reply: AssistantReply = intent === 'match' ? await sendMatchSuggestionMessage(body) : await sendSupportMessage(body)
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
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-brand-yellow text-brand-navy">🏸</span>
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
                  onClick={() => void send(quick.text, quick.intent)}
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

      <button
        ref={trigger}
        type="button"
        aria-label={open ? 'Thu gọn trợ lý AI' : 'Mở trợ lý AI'}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-2 rounded-full bg-brand-navy px-4 py-3 font-bold text-surface shadow-[var(--shadow-raised)] transition hover:-translate-y-0.5"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>
        <span>{open ? 'Đóng' : 'Trợ lý AI'}</span>
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
                <span className="mt-0.5 block text-xs text-ink-500">Điểm F-02: {Math.round(item.score)} · {item.explanation}</span>
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
            Mở luồng để xác nhận
          </Link>
        )}

        {message.fallback && <p className="mt-1.5 text-[11px] font-semibold text-warning">Nguồn AI tạm thời chưa sẵn sàng</p>}
      </div>
      {message.at > 0 && <span className="mt-1 px-1 text-[11px] text-ink-400">{clock(message.at)}</span>}
    </div>
  )
}
