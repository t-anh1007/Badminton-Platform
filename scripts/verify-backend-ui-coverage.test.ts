import { describe, expect, it } from 'vitest'
import {
  discoverCapabilities,
  extractRouterCalls,
  validateManifest,
  type CapabilityManifest,
} from './verify-backend-ui-coverage'

describe('backend to UI capability coverage', () => {
  it('discovers named routers with their mount prefix', () => {
    expect(extractRouterCalls(
      "authRouter.post('/login', requireAuth, handler)",
      'account-service',
      'services/account-service/src/routes/auth.ts',
      '/auth',
    )).toEqual([
      expect.objectContaining({
        id: 'account-service:http:POST:/auth/login',
        methodOrEvent: 'POST',
        pathOrName: '/auth/login',
      }),
    ])
  })

  it('discovers the complete baseline HTTP, socket and domain-event capabilities', () => {
    const capabilities = discoverCapabilities(process.cwd())
    const http = capabilities.filter((capability) => capability.kind === 'http')

    expect(http).toHaveLength(111)
    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'api-gateway:http:GET:/health' }),
      expect.objectContaining({ id: 'account-service:http:POST:/auth/login' }),
      expect.objectContaining({ id: 'matchmaking-service:socket:quick_match:find' }),
      expect.objectContaining({ id: 'cross-service:event:ProviderApproved' }),
    ]))
  })

  it('rejects missing, stale and malformed rows in both directions', () => {
    const discovered = [extractRouterCalls(
      "authRouter.post('/login', handler)",
      'account-service',
      'services/account-service/src/routes/auth.ts',
      '/auth',
    )[0]]
    const manifest: CapabilityManifest = {
      version: 2,
      capabilities: [
        {
          id: 'account-service:http:POST:/auth/login',
          service: 'account-service',
          kind: 'http',
          methodOrEvent: 'POST',
          pathOrName: '/auth/login',
          access: 'public',
          classification: 'planned',
          surfaceId: 'planned:account-service',
          task: 17,
          evidenceId: 'planned:role-aware-full-ui-ux-completion',
          source: 'services/account-service/src/routes/auth.ts',
        },
        {
          id: 'stale:http:GET:/removed',
          service: 'stale',
          kind: 'http',
          methodOrEvent: 'GET',
          pathOrName: '/removed',
          access: 'public',
          classification: 'direct',
          surfaceId: '',
          task: 0,
          evidenceId: '',
          source: 'removed.ts',
        },
      ],
    }

    const result = validateManifest(discovered, manifest, { allowPlanned: true })

    expect(result.missing).toEqual([])
    expect(result.stale.map((row) => row.id)).toEqual(['stale:http:GET:/removed'])
    expect(result.invalid.map((entry) => entry.row.id)).toContain('stale:http:GET:/removed')
  })
})
