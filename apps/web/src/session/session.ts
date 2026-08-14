import type { SessionResult } from '../lib/accountApi.js'

export type UserRole = 'player' | 'provider' | 'admin'
export interface SessionState extends SessionResult { userId: string; roles: UserRole[]; activeRole: UserRole }
const SESSION_KEY = 'courtin.session'
const ACTIVE_ROLE_KEY = 'courtin.activeRole'

function userIdFromAccessToken(accessToken: string) {
  const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string }
  if (!payload.sub) throw new Error('Phiên đăng nhập không hợp lệ.')
  return payload.sub
}
export function loadSession(): SessionState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as SessionState | null
    if (parsed?.accessToken && parsed.refreshToken && parsed.userId && Array.isArray(parsed.roles) && parsed.roles.includes(parsed.activeRole)) return parsed
    const accessToken = localStorage.getItem('accessToken'); const refreshToken = localStorage.getItem('refreshToken')
    if (!accessToken || !refreshToken) return null
    return saveSession({ accessToken, refreshToken, roles: JSON.parse(localStorage.getItem('roles') ?? '[]') })
  } catch { return null }
}
export function saveSession(result: SessionResult, preferredRole?: UserRole): SessionState {
  const roles = result.roles.filter((role): role is UserRole => role === 'player' || role === 'provider' || role === 'admin')
  const storedRole = preferredRole ?? (localStorage.getItem(ACTIVE_ROLE_KEY) as UserRole | null)
  const activeRole = storedRole && roles.includes(storedRole) ? storedRole : roles[0] ?? 'player'
  const session = { ...result, userId: userIdFromAccessToken(result.accessToken), roles, activeRole }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session)); localStorage.setItem(ACTIVE_ROLE_KEY, activeRole)
  // Keep existing API clients operational until their token reads are migrated to this module.
  localStorage.setItem('accessToken', session.accessToken); localStorage.setItem('refreshToken', session.refreshToken); localStorage.setItem('roles', JSON.stringify(session.roles))
  window.dispatchEvent(new Event('courtin:session-change'))
  return session
}
export function clearSession() { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(ACTIVE_ROLE_KEY); localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); localStorage.removeItem('roles'); window.dispatchEvent(new Event('courtin:session-change')) }
