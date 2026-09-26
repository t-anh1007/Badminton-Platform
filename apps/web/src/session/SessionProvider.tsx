import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AccountApiError, logout as requestLogout, refreshSession, type SessionResult } from '../lib/accountApi.js'
import { clearSession, loadSession, saveSession, type SessionState, type UserRole } from './session.js'

// Access token sống cố định 15 phút (không trượt theo thao tác) — làm mới trước hạn 1 phút,
// và kiểm tra lại khi tab được mở lại vì timer của tab nền bị trình duyệt trì hoãn.
const REFRESH_LEAD_MS = 60_000
function accessTokenExpiresAt(accessToken: string) {
  try { const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }; return payload.exp ? payload.exp * 1000 : null } catch { return null }
}

interface SessionContextValue { session: SessionState | null; establish: (result: SessionResult) => SessionState; setActiveRole: (role: UserRole) => void; refresh: () => Promise<SessionState | null>; logout: () => Promise<void> }
const SessionContext = createContext<SessionContextValue | null>(null)
export function SessionProvider({ children }: { children: ReactNode }) {
  const [initialSession] = useState<SessionState | null>(() => loadSession())
  const [session, setSession] = useState<SessionState | null>(initialSession)
  const [ready, setReady] = useState(initialSession === null)
  const initialRefreshStarted = useRef(false)
  useEffect(() => { const sync = () => setSession(loadSession()); window.addEventListener('courtin:session-change', sync); return () => window.removeEventListener('courtin:session-change', sync) }, [])
  useEffect(() => {
    if (!initialSession || initialRefreshStarted.current) return
    initialRefreshStarted.current = true
    void refreshSession(initialSession.refreshToken)
      .then((result) => setSession(saveSession(result, initialSession.activeRole)))
      .catch(() => { clearSession(); setSession(null) })
      .finally(() => setReady(true))
  }, [initialSession])
  const refreshToken = session?.refreshToken
  const accessToken = session?.accessToken
  useEffect(() => {
    if (!ready || !refreshToken || !accessToken) return
    const expiresAt = accessTokenExpiresAt(accessToken)
    if (!expiresAt) return
    let inFlight = false
    const renew = () => {
      if (inFlight || Date.now() < expiresAt - REFRESH_LEAD_MS) return
      inFlight = true
      void refreshSession(refreshToken)
        .then((result) => setSession(saveSession(result)))
        // Chỉ đăng xuất khi server từ chối phiên; lỗi mạng thoáng qua thì thử lại lần sau.
        .catch((error) => { if (error instanceof AccountApiError && (error.status === 401 || error.status === 403)) { clearSession(); setSession(null) } })
        .finally(() => { inFlight = false })
    }
    const timer = window.setTimeout(renew, Math.max(0, expiresAt - REFRESH_LEAD_MS - Date.now()))
    const onVisible = () => { if (document.visibilityState === 'visible') renew() }
    window.addEventListener('focus', renew); document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', renew); document.removeEventListener('visibilitychange', onVisible) }
  }, [ready, refreshToken, accessToken])
  const value = useMemo<SessionContextValue>(() => ({ session,
    establish: (result) => { const next = saveSession(result); setSession(next); return next },
    setActiveRole: (role) => setSession((current) => current?.roles.includes(role) ? saveSession(current, role) : current),
    refresh: async () => { if (!session) return null; try { const next = saveSession(await refreshSession(session.refreshToken), session.activeRole); setSession(next); return next } catch { clearSession(); setSession(null); return null } },
    logout: async () => { const token = session?.refreshToken; try { if (token) await requestLogout(token) } finally { clearSession(); setSession(null) } },
  }), [session])
  return <SessionContext.Provider value={value}>{ready ? children : null}</SessionContext.Provider>
}
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error('useSession must be used within SessionProvider'); return value }
