import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { logout as requestLogout, refreshSession, type SessionResult } from '../lib/accountApi.js'
import { clearSession, loadSession, saveSession, type SessionState, type UserRole } from './session.js'

interface SessionContextValue { session: SessionState | null; establish: (result: SessionResult) => SessionState; setActiveRole: (role: UserRole) => void; refresh: () => Promise<SessionState | null>; logout: () => Promise<void> }
const SessionContext = createContext<SessionContextValue | null>(null)
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(() => loadSession())
  useEffect(() => { const sync = () => setSession(loadSession()); window.addEventListener('courtin:session-change', sync); return () => window.removeEventListener('courtin:session-change', sync) }, [])
  const value = useMemo<SessionContextValue>(() => ({ session,
    establish: (result) => { const next = saveSession(result); setSession(next); return next },
    setActiveRole: (role) => setSession((current) => current?.roles.includes(role) ? saveSession(current, role) : current),
    refresh: async () => { if (!session) return null; try { const next = saveSession(await refreshSession(session.refreshToken), session.activeRole); setSession(next); return next } catch { clearSession(); setSession(null); return null } },
    logout: async () => { const token = session?.refreshToken; try { if (token) await requestLogout(token) } finally { clearSession(); setSession(null) } },
  }), [session])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error('useSession must be used within SessionProvider'); return value }
