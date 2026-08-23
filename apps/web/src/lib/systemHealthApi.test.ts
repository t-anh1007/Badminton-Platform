import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSystemHealth } from './systemHealthApi'

describe('getSystemHealth', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not report Vercel SPA HTML 200 as a healthy service', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })))

    await expect(getSystemHealth()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ state: 'degraded' }),
    ]))
  })
})
