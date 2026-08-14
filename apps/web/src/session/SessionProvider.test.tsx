import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SessionProvider, useSession } from './SessionProvider.js'

describe('SessionProvider', () => {
  it('does not permit selecting a role absent from the session', () => {
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider })
    act(() => result.current.setSession({ userId: 'p1', accessToken: 'a', refreshToken: 'r', roles: ['player'], activeRole: 'player' }))
    act(() => result.current.setActiveRole('admin'))
    expect(result.current.session?.activeRole).toBe('player')
  })
})
