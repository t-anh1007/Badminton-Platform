import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logout, refreshSession } from '../lib/accountApi.js'
import { SessionProvider, useSession } from './SessionProvider.js'

vi.mock('../lib/accountApi.js', () => ({ refreshSession: vi.fn(), logout: vi.fn() }))

const token = (sub: string) => `x.${btoa(JSON.stringify({ sub }))}.x`

describe('SessionProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(refreshSession).mockReset()
    vi.mocked(logout).mockReset()
  })

  it('establishes and persists a newly authenticated session', () => {
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider })
    act(() => result.current.establish({ accessToken: token('p1'), refreshToken: 'r', roles: ['player'] }))
    expect(result.current.session).toMatchObject({ userId: 'p1', activeRole: 'player' })
    expect(JSON.parse(localStorage.getItem('courtin.session') ?? '{}')).toMatchObject({ userId: 'p1' })
  })

  it('does not permit selecting a role absent from the session', () => {
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider })
    act(() => result.current.establish({ accessToken: token('p1'), refreshToken: 'r', roles: ['player'] }))
    act(() => result.current.setActiveRole('admin'))
    expect(result.current.session?.activeRole).toBe('player')
  })

  it('refreshes roles without requiring another login', async () => {
    vi.mocked(refreshSession).mockResolvedValue({ accessToken: token('p1'), refreshToken: 'r', roles: ['player', 'provider'] })
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider })
    act(() => result.current.establish({ accessToken: token('p1'), refreshToken: 'r', roles: ['player'] }))
    await act(() => result.current.refresh())
    expect(result.current.session?.roles).toEqual(['player', 'provider'])
  })

  it('refreshes a persisted session when the application hydrates', async () => {
    const refreshedAccessToken = `x.${btoa(JSON.stringify({ sub: 'p1', revision: 2 }))}.x`
    localStorage.setItem('courtin.session', JSON.stringify({
      accessToken: token('p1'),
      refreshToken: 'stored-refresh-token',
      roles: ['player', 'admin'],
      userId: 'p1',
      activeRole: 'admin',
    }))
    localStorage.setItem('courtin.activeRole', 'admin')
    localStorage.setItem('accessToken', token('p1'))
    localStorage.setItem('refreshToken', 'stored-refresh-token')
    localStorage.setItem('roles', JSON.stringify(['player', 'admin']))
    vi.mocked(refreshSession).mockResolvedValue({
      accessToken: refreshedAccessToken,
      refreshToken: 'rotated-refresh-token',
      roles: ['player', 'admin'],
    })

    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider })

    await waitFor(() => expect(result.current.session?.accessToken).toBe(refreshedAccessToken))
    expect(result.current.session).toMatchObject({ activeRole: 'admin', refreshToken: 'rotated-refresh-token' })
  })

  it('attempts server logout before clearing the local session', async () => {
    let resolveLogout!: () => void
    vi.mocked(logout).mockImplementation(() => new Promise((resolve) => { resolveLogout = () => resolve({ message: 'ok' }) }))
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider })
    act(() => result.current.establish({ accessToken: token('p1'), refreshToken: 'refresh-token', roles: ['player'] }))

    let pending!: Promise<void>
    act(() => { pending = result.current.logout() })
    expect(logout).toHaveBeenCalledWith('refresh-token')
    expect(result.current.session?.userId).toBe('p1')

    await act(async () => { resolveLogout(); await pending })
    expect(result.current.session).toBeNull()
    expect(localStorage.getItem('courtin.session')).toBeNull()
  })
})
