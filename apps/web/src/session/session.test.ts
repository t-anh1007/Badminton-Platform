import { beforeEach, describe, expect, it } from 'vitest'
import { clearSession, loadSession, saveSession } from './session.js'

const token = (sub: string) => `x.${btoa(JSON.stringify({ sub })).replaceAll('=', '')}.x`
describe('session persistence', () => {
  beforeEach(() => { localStorage.clear() })
  it('clears an invalid stored session and keeps active role within granted roles', () => {
    localStorage.setItem('courtin.session', '{bad')
    expect(loadSession()).toBeNull()
    const session = saveSession({ accessToken: token('player-1'), refreshToken: 'refresh', roles: ['player', 'provider'] }, 'provider')
    expect(session.activeRole).toBe('provider')
    clearSession()
    expect(loadSession()).toBeNull()
  })
  it('defaults admin then provider accounts to their managing role on a fresh login', () => {
    expect(saveSession({ accessToken: token('admin-1'), refreshToken: 'refresh', roles: ['player', 'admin'] }).activeRole).toBe('admin')
    clearSession()
    expect(saveSession({ accessToken: token('player-1'), refreshToken: 'refresh', roles: ['player', 'provider'] }).activeRole).toBe('provider')
    clearSession()
    expect(saveSession({ accessToken: token('player-2'), refreshToken: 'refresh', roles: ['player'] }).activeRole).toBe('player')
  })
})
