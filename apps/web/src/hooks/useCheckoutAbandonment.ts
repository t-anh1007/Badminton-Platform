import { useEffect, useRef } from 'react'

/** Nhả reservation khi rời route hoặc đóng/reload trang. Cleanup được trì
 * hoãn một nhịp để lần cleanup giả của React StrictMode không hủy checkout. */
export function useCheckoutAbandonment(abandon: (() => Promise<unknown>) | null) {
  const abandonRef = useRef(abandon)
  const cleanupTimer = useRef<number | null>(null)
  abandonRef.current = abandon

  useEffect(() => {
    if (cleanupTimer.current !== null) window.clearTimeout(cleanupTimer.current)
    const run = () => { void abandonRef.current?.().catch(() => undefined) }
    window.addEventListener('pagehide', run)
    return () => {
      window.removeEventListener('pagehide', run)
      cleanupTimer.current = window.setTimeout(run, 0)
    }
  }, [])
}
