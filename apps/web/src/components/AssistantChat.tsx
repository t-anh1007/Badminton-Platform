import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { chatAiMatchSuggestions, type AiMatchSuggestion } from '../lib/assistantApi.js'
import { Button, TextArea } from './ui'

interface MatchChatMessage {
  id: string
  role: 'user' | 'assistant'
  body: string
  actionPath?: string
}

export function AssistantChat({ compact = false }: { compact?: boolean }) {
  const [draft, setDraft] = useState('')
  const [lastQuestion, setLastQuestion] = useState('')
  const [messages, setMessages] = useState<MatchChatMessage[]>([])
  const [suggestions, setSuggestions] = useState<AiMatchSuggestion[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const send = async (question: string) => {
    const body = question.trim()
    if (!body || loading) return
    setLoading(true)
    setError('')
    setLastQuestion(body)
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', body }])
    setDraft('')
    try {
      const next = await chatAiMatchSuggestions(body)
      setSuggestions(next.suggestions)
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        body: next.answer,
        actionPath: next.actionPath,
      }])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải gợi ý kèo.')
    } finally {
      setLoading(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void send(draft)
  }

  return (
    <section className={`grid gap-5 ${compact ? '' : 'lg:grid-cols-2'}`}>
      <aside aria-live="polite" aria-label="Gợi ý kèo trực tiếp">
        <h2 className="text-h2">Gợi ý kèo</h2>
        {suggestions.length === 0 && <p className="mt-2 text-sm text-ink-500">Hãy mô tả khu vực, thời gian hoặc mức phí bạn mong muốn.</p>}
        {suggestions.map((item) => (
          <Link key={item.matchId} className="mt-3 block rounded-xl border border-line p-3" to={`/matches/${item.matchId}`}>
            <strong>{item.match.venue.name} · {item.match.court.name}</strong>
            <span className="mt-1 block text-sm text-ink-500">Điểm F-02: {Math.round(item.score)} · {item.explanation}</span>
          </Link>
        ))}
      </aside>
      <div>
        <h2 className="text-h2">Trò chuyện</h2>
        <div className="mt-3 space-y-2" aria-live="polite">
          {messages.map((message) => (
            <div key={message.id} className={`rounded-xl p-3 text-sm ${message.role === 'user' ? 'ml-6 bg-brand-navy text-white' : 'mr-6 bg-canvas'}`}>
              <p>{message.body}</p>
              {message.actionPath && <Link className="mt-2 inline-block font-bold underline" to={message.actionPath}>Mở danh sách kèo để xác nhận</Link>}
            </div>
          ))}
          {loading && <p role="status" className="rounded-xl bg-canvas p-3 text-sm">Đang tìm kèo phù hợp…</p>}
          {error && <div role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}<Button className="ml-2" size="sm" tone="secondary" onClick={() => void send(lastQuestion)}>Thử lại</Button></div>}
        </div>
        <form className="mt-3" onSubmit={submit}>
          <TextArea autoFocus={compact} aria-label="Nhắn cho trợ lý tìm kèo" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <Button className="mt-2" type="submit" disabled={loading || !draft.trim()}>{loading ? 'Đang tìm…' : 'Gửi'}</Button>
        </form>
      </div>
    </section>
  )
}
