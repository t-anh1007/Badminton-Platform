import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../session/SessionProvider.js'
import { AssistantChat } from './AssistantChat.js'

export function AssistantBubble() {
  const [open, setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null); const { session } = useSession()
  if (!session || session.activeRole !== 'player') return null
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()) }
  return <div className="fixed bottom-5 right-5 z-50"><button ref={trigger} type="button" aria-label="Mở trợ lý AI" onClick={() => setOpen(true)} className="rounded-full bg-brand-yellow px-4 py-3 font-bold text-brand-navy">Trợ lý AI</button>{open && <section role="dialog" aria-label="Trợ lý AI nhanh" className="mt-2 w-80 rounded-2xl bg-surface p-4 shadow-xl" onKeyDown={(event) => { if (event.key === 'Escape') close() }}><button type="button" onClick={close} className="float-right">Đóng</button><AssistantChat compact /><Link className="mt-4 inline-block font-bold text-brand-navy" to="/assistant" onClick={close}>Mở trải nghiệm đầy đủ</Link></section>}</div>
}
