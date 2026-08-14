import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { logout as requestLogout, refreshSession } from '../lib/accountApi.js'
import { clearSession, loadSession, saveSession, type SessionState, type UserRole } from './session.js'

interface SessionContextValue { session: SessionState | null; setActiveRole: (role: UserRole) => void; refresh: () => Promise<SessionState | null>; logout: () => Promise<void>; setSession: (session: SessionState) => void }
const SessionContext = createContext<SessionContextValue | null>(null)
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(() => loadSession())
  const value = useMemo<SessionContextValue>(() => ({ session, setSession,
    setActiveRole: (role) => setSession((current) => current?.roles.includes(role) ? saveSession(current, role) : current),
    refresh: async () => { if (!session) return null; try { const next = saveSession(await refreshSession(session.refreshToken), session.activeRole); setSession(next); return next } catch { clearSession(); setSession(null); return null } },
    logout: async () => { const token = session?.refreshToken; try { if (token) await requestLogout(token) } finally { clearSession(); setSession(null) } },
  }), [session])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error('useSession must be used within SessionProvider'); return value }
