import { useState } from 'react'
import { Link } from 'react-router-dom'
import { chatAiMatchSuggestions, type AiMatchSuggestion } from '../lib/assistantApi.js'
import { Button, TextArea } from './ui'

export function AssistantChat({ compact = false }: { compact?: boolean }) {
  const [message, setMessage] = useState(''); const [answer, setAnswer] = useState(''); const [suggestions, setSuggestions] = useState<AiMatchSuggestion[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const send = async () => { if (!message.trim() || loading) return; setLoading(true); setError(''); try { const next = await chatAiMatchSuggestions(message); setAnswer(next.answer); setSuggestions(next.suggestions) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải gợi ý.') } finally { setLoading(false) } }
  return <section className={`grid gap-5 ${compact ? '' : 'lg:grid-cols-2'}`}><aside aria-live="polite"><h2 className="text-h2">Gợi ý kèo</h2>{suggestions.map((item) => <Link key={item.matchId} className="mt-3 block rounded-xl border border-line p-3" to={`/matches/${item.matchId}`}>{item.match.venue.name} · {item.explanation}</Link>)}</aside><div><h2 className="text-h2">Trò chuyện</h2>{answer && <p className="mt-3 rounded-xl bg-canvas p-3">{answer}</p>}{error && <p role="alert">{error}</p>}<TextArea className="mt-3" value={message} onChange={(event) => setMessage(event.target.value)} /><Button className="mt-2" onClick={() => void send()} disabled={loading || !message.trim()}>{loading ? 'Đang tìm…' : 'Gửi'}</Button></div></section>
}
