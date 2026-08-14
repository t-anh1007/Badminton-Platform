import { act, renderHook } from '@testing-library/react'
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
})
