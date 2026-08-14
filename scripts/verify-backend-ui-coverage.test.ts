import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  discoverCapabilities,
  extractRouterCalls,
  readMountedServiceRoutes,
  validateManifest,
  type CapabilityManifest,
} from './verify-backend-ui-coverage'

describe('backend to UI capability coverage', () => {
  const temporaryRoots: string[] = []

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

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

  it('does not leak authentication middleware from the next route call', () => {
    const source = [
      "venueRouter.get('/:id', publicHandler)",
      "venueRouter.patch('/:id', requireAuth, privateHandler)",
    ].join('\n')

    const capabilities = extractRouterCalls(source, 'venue-booking-service', 'venues.ts', '/venues')

    expect(capabilities[0]).toEqual(expect.objectContaining({ access: 'public', classification: 'planned' }))
    expect(capabilities[1]).toEqual(expect.objectContaining({ access: 'authenticated', classification: 'planned' }))
  })

  it('automatically discovers a newly mounted route file', () => {
    const root = mkdtempSync(join(tmpdir(), 'ui-coverage-'))
    temporaryRoots.push(root)
    const sourceRoot = join(root, 'services', 'community-service', 'src')
    mkdirSync(join(sourceRoot, 'routes'), { recursive: true })
    writeFileSync(join(sourceRoot, 'app.ts'), [
      "import { uploadRouter } from './routes/uploads.js'",
      "app.use('/uploads', uploadRouter)",
    ].join('\n'))
    writeFileSync(join(sourceRoot, 'routes', 'uploads.ts'), "uploadRouter.post('/authorize', requireAuth, handler)")

    expect(readMountedServiceRoutes(root, 'community-service')).toEqual([
      expect.objectContaining({
        id: 'community-service:http:POST:/uploads/authorize',
        access: 'authenticated',
      }),
    ])
  })

  it('discovers the complete baseline HTTP, socket and domain-event capabilities', () => {
    const capabilities = discoverCapabilities(process.cwd())
    const http = capabilities.filter((capability) => capability.kind === 'http')

    expect(http).toHaveLength(122)
    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'api-gateway:http:GET:/health' }),
      expect.objectContaining({ id: 'account-service:http:POST:/auth/login' }),
      expect.objectContaining({ id: 'matchmaking-service:socket:quick_match:find' }),
      expect.objectContaining({ id: 'cross-service:event:ProviderApproved' }),
      expect.objectContaining({ id: 'cross-service:event:ObjectCleanupScheduled' }),
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

  it('rejects access drift from discovered source', () => {
    const discovered = extractRouterCalls(
      "venueRouter.get('/:id', publicHandler)",
      'venue-booking-service',
      'venues.ts',
      '/venues',
    )
    const row: CapabilityManifest['capabilities'][number] = {
      ...discovered[0],
      access: 'authenticated',
      classification: 'indirect',
      surfaceId: 'venue:detail',
      task: 17,
      evidenceId: 'test:venue-detail',
    }

    const result = validateManifest(discovered, { version: 2, capabilities: [row] }, { allowPlanned: true })

    expect(result.invalid[0].reasons).toContain('source identity drift')
  })

  it('accepts promotion from unclassified discovery to a final direct surface', () => {
    const discovered = extractRouterCalls(
      "venueRouter.get('/:id', publicHandler)",
      'venue-booking-service',
      'venues.ts',
      '/venues',
    )
    const row: CapabilityManifest['capabilities'][number] = {
      ...discovered[0],
      classification: 'direct',
      surfaceId: 'player:venues',
      task: 17,
      evidenceId: 'test:web-account-venue-finance',
    }

    expect(validateManifest(discovered, { version: 2, capabilities: [row] }, { allowPlanned: false }).invalid).toEqual([])
  })
})
