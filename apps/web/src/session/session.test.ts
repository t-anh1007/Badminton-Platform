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
})
