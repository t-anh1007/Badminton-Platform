import { useEffect, useState } from 'react'
import { Badge, Button, EmptyState, TextArea } from '../../components/ui'
import { addSupportTicketMessage, getSupportTicket, listSupportTickets, setSupportTicketStatus, type SupportTicket, type SupportTicketDetail } from '../../lib/communityApi'

export function AdminTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [selected, setSelected] = useState<SupportTicketDetail | null>(null)
  const [reply, setReply] = useState('')
  const [message, setMessage] = useState('')

  const loadDetail = async (id: string) => { try { setSelected(await getSupportTicket(id)) } catch (cause) { setMessage((cause as Error).message) } }
  const load = async () => {
    try {
      const result = await listSupportTickets()
      setTickets(result.tickets)
      if (result.tickets[0]) await loadDetail(result.tickets[0].id)
    } catch (cause) { setMessage((cause as Error).message) }
  }
  useEffect(() => { void load() }, [])

  const sendReply = async () => {
    if (!selected || !reply.trim()) { setMessage('Nhập nội dung phản hồi trước khi gửi.'); return }
    try { await addSupportTicketMessage(selected.id, reply.trim()); setReply(''); await loadDetail(selected.id) }
    catch (cause) { setMessage((cause as Error).message) }
  }
  const updateStatus = async (status: 'resolved' | 'closed') => {
    if (!selected) return
    try { await setSupportTicketStatus(selected.id, status); await load() }
    catch (cause) { setMessage((cause as Error).message) }
  }

  return (
    <>
      <h2 className="text-h1">Ticket hỗ trợ</h2>
      <p className="mt-2 text-ink-500">Trao đổi riêng tư, phản hồi và kết thúc từng yêu cầu hỗ trợ.</p>
      {message && <p role="status" className="mt-4 rounded-xl bg-info-bg p-3 text-sm">{message}</p>}
      <div className="mt-6 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="surface-card p-3">
          <h3 className="font-bold">Hàng chờ</h3>
          <div className="mt-3 space-y-2">{tickets.length ? tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => void loadDetail(ticket.id)} className="w-full rounded-xl border border-line p-3 text-left"><p className="font-medium">{ticket.subject}</p><Badge>{ticket.status}</Badge></button>) : <EmptyState title="Không có ticket" description="Ticket mới sẽ xuất hiện tại đây." />}</div>
        </section>
        <section className="surface-card p-4">
          {selected ? <><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-h2">{selected.subject}</h3><Badge>{selected.status}</Badge></div><div className="mt-4 space-y-2">{selected.messages.map((item) => <article key={item.id} className={`rounded-xl p-3 ${item.senderRole === 'admin' ? 'bg-brand-yellow-soft' : 'bg-canvas'}`}><p className="text-xs font-bold uppercase">{item.senderRole === 'admin' ? 'Đội ngũ hỗ trợ' : 'Người yêu cầu'}</p><p className="mt-1">{item.body}</p></article>)}</div><TextArea aria-label="Nội dung phản hồi hỗ trợ" className="mt-4" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Nhập phản hồi…" /><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void sendReply()}>Gửi phản hồi</Button>{selected.status !== 'resolved' && selected.status !== 'closed' && <Button tone="secondary" onClick={() => void updateStatus('resolved')}>Đánh dấu đã giải quyết</Button>}{selected.status === 'resolved' && <Button tone="danger" onClick={() => void updateStatus('closed')}>Đóng ticket</Button>}</div></> : <EmptyState title="Chọn một ticket" description="Nội dung trao đổi sẽ hiển thị tại đây." />}
        </section>
      </div>
    </>
  )
}
