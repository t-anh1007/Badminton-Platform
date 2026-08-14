import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { logout as requestLogout, refreshSession, type SessionResult } from '../lib/accountApi.js'
import { clearSession, loadSession, saveSession, type SessionState, type UserRole } from './session.js'

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
  const value = useMemo<SessionContextValue>(() => ({ session,
    establish: (result) => { const next = saveSession(result); setSession(next); return next },
    setActiveRole: (role) => setSession((current) => current?.roles.includes(role) ? saveSession(current, role) : current),
    refresh: async () => { if (!session) return null; try { const next = saveSession(await refreshSession(session.refreshToken), session.activeRole); setSession(next); return next } catch { clearSession(); setSession(null); return null } },
    logout: async () => { const token = session?.refreshToken; try { if (token) await requestLogout(token) } finally { clearSession(); setSession(null) } },
  }), [session])
  return <SessionContext.Provider value={value}>{ready ? children : null}</SessionContext.Provider>
}
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error('useSession must be used within SessionProvider'); return value }
