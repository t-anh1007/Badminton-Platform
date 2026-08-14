import { useEffect, useState } from 'react'
import { Button } from './ui.js'
export function QuickMatchSearchOverlay({ found, onCancel, onAccept, timeoutMs = 15000 }: { found?: { matchId: string; title: string }; onCancel: () => void; onAccept: (matchId: string) => void; timeoutMs?: number }) {
  const [elapsed, setElapsed] = useState(0); const [timedOut, setTimedOut] = useState(false)
  useEffect(() => { const started=Date.now(); const t=window.setInterval(()=>{ const value=Date.now()-started; setElapsed(value); if(value>=timeoutMs) setTimedOut(true) }, 250); return ()=>window.clearInterval(t) }, [timeoutMs])
  return <section role="dialog" aria-label="Tìm nhanh"><div className="animate-pulse motion-reduce:animate-none">Đang tìm kèo · {Math.floor(elapsed / 1000)}s</div>{found ? <><p>Đã tìm thấy {found.title}</p><Button onClick={()=>onAccept(found.matchId)}>Tham gia kèo</Button></> : timedOut ? <p>Đã hết thời gian tìm kèo.</p> : <Button tone="secondary" onClick={onCancel}>Dừng tìm</Button>}</section>
}
