import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

export type CapabilityKind = 'http' | 'socket' | 'event'
export type CapabilityAccess = 'public' | 'authenticated' | 'internal' | 'webhook' | 'ops' | 'socket' | 'event'
export type CapabilityClassification = 'direct' | 'indirect' | 'ops' | 'planned'

export interface DiscoveredCapability {
  id: string
  service: string
  kind: CapabilityKind
  methodOrEvent: string
  pathOrName: string
  access: CapabilityAccess
  classification: CapabilityClassification
  source: string
}

export interface CapabilityManifestRow extends DiscoveredCapability {
  surfaceId: string
  task: number
  evidenceId: string
}

export interface CapabilityManifest {
  version: number
  capabilities: CapabilityManifestRow[]
}

interface EventAllowlistEntry {
  name: string
  surfaceId: string
  task: number
  evidenceId: string
}

interface EventAllowlist {
  version: number
  events: EventAllowlistEntry[]
}

const ACCESS_VALUES = new Set<CapabilityAccess>(['public', 'authenticated', 'internal', 'webhook', 'ops', 'socket', 'event'])
const CLASSIFICATION_VALUES = new Set<CapabilityClassification>(['direct', 'indirect', 'ops', 'planned'])
const KIND_VALUES = new Set<CapabilityKind>(['http', 'socket', 'event'])

function normalizePath(prefix: string, routePath: string): string {
  const path = `${prefix}/${routePath}`.replaceAll(/\/{2,}/g, '/')
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

function classifyHttp(path: string, statement: string): Pick<DiscoveredCapability, 'access' | 'classification'> {
  if (path === '/health') return { access: 'ops', classification: 'ops' }
  if (path.startsWith('/internal/')) return { access: 'internal', classification: 'indirect' }
  if (path.includes('/webhook')) return { access: 'webhook', classification: 'indirect' }
  if (/\brequire(?:Auth|Role|Admin|Player|Provider)\b/.test(statement)) {
    return { access: 'authenticated', classification: 'planned' }
  }
  return { access: 'public', classification: 'planned' }
}

export function extractRouterCalls(
  source: string,
  service: string,
  sourcePath: string,
  mountPrefix: string,
): DiscoveredCapability[] {
  const routePattern = /\b[A-Za-z_$][\w$]*\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g
  return [...source.matchAll(routePattern)].map((match) => {
    const method = match[1].toUpperCase()
    const path = normalizePath(mountPrefix, match[2])
    const statement = readBalancedCall(source, match.index ?? 0)
    const classification = classifyHttp(path, statement)
    return {
      id: `${service}:http:${method}:${path}`,
      service,
      kind: 'http',
      methodOrEvent: method,
      pathOrName: path,
      ...classification,
      source: sourcePath,
    }
  })
}

function readBalancedCall(source: string, start: number): string {
  const open = source.indexOf('(', start)
  if (open === -1) return source.slice(start)
  let depth = 0
  let quote = ''
  let escaped = false
  for (let index = open; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      continue
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character
      continue
    }
    if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return source.slice(start)
}

function routeMounts(appSource: string): Map<string, string> {
  const symbolToFile = new Map<string, string>()
  for (const match of appSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/routes\/([^'"]+)\.js['"]/gs)) {
    for (const imported of match[1].split(',')) {
      const declaration = imported.trim().replace(/^type\s+/, '')
      if (!declaration) continue
      const [original, alias] = declaration.split(/\s+as\s+/)
      symbolToFile.set((alias ?? original).trim(), `${match[2]}.ts`)
    }
  }

  const mounts = new Map<string, string>()
  for (const match of appSource.matchAll(/app\.use\(\s*(?:['"]([^'"]+)['"]\s*,\s*)?([A-Za-z_$][\w$]*)/g)) {
    const file = symbolToFile.get(match[2])
    if (file) mounts.set(file, match[1] ?? '')
  }
  return mounts
}

export function readMountedServiceRoutes(root: string, service: string): DiscoveredCapability[] {
  const sourceRoot = join(root, 'services', service, 'src')
  const routeDirectory = join(sourceRoot, 'routes')
  const appFile = join(sourceRoot, 'app.ts')
  if (!existsSync(routeDirectory) || !existsSync(appFile)) return []
  const mounts = routeMounts(readFileSync(appFile, 'utf8'))

  return readdirSync(routeDirectory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return []
    const file = join(routeDirectory, entry.name)
    const source = readFileSync(file, 'utf8')
    if (extractRouterCalls(source, service, entry.name, '').length === 0) return []
    const mountPrefix = mounts.get(entry.name)
    if (mountPrefix === undefined) {
      throw new Error(`Route source with HTTP declarations is not mounted in ${relative(root, appFile)}: ${relative(root, file)}`)
    }
    return extractRouterCalls(
      source,
      service,
      relative(root, file).replaceAll('\\', '/'),
      mountPrefix,
    )
  })
}

function readServiceRoutes(root: string): DiscoveredCapability[] {
  return readdirSync(join(root, 'services'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-service'))
    .flatMap((entry) => readMountedServiceRoutes(root, entry.name))
}

function readHealthRoutes(root: string): DiscoveredCapability[] {
  const services = readdirSync(join(root, 'services'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && (entry.name.endsWith('-service') || entry.name === 'api-gateway'))
    .map((entry) => entry.name)

  return services.flatMap((service) => {
    const sourceFile = service === 'api-gateway'
      ? join(root, 'services', service, 'src', 'index.ts')
      : join(root, 'services', service, 'src', 'app.ts')
    if (!existsSync(sourceFile)) return []
    const sourcePath = relative(root, sourceFile).replaceAll('\\', '/')
    return extractRouterCalls(readFileSync(sourceFile, 'utf8'), service, sourcePath, '')
      .filter((capability) => capability.pathOrName === '/health')
  })
}

function readSocketCapabilities(root: string): DiscoveredCapability[] {
  const file = join(root, 'services', 'matchmaking-service', 'src', 'lib', 'quickMatchGateway.ts')
  const source = readFileSync(file, 'utf8')
  const names = new Set<string>()
  for (const match of source.matchAll(/['"](quick_match:[a-z_]+)['"]\s*:/g)) names.add(match[1])
  for (const match of source.matchAll(/socket\.(?:on|emit)\(\s*['"](quick_match:[a-z_]+)['"]/g)) names.add(match[1])
  const sourcePath = relative(root, file).replaceAll('\\', '/')
  return [...names].sort().map((name) => ({
    id: `matchmaking-service:socket:${name}`,
    service: 'matchmaking-service',
    kind: 'socket',
    methodOrEvent: name,
    pathOrName: name,
    access: 'socket',
    classification: 'planned',
    source: sourcePath,
  }))
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'test' || entry.name === 'node_modules' ? [] : sourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

function readEventCapabilities(root: string): DiscoveredCapability[] {
  const allowlistPath = join(root, 'scripts', 'backend-ui-event-allowlist.json')
  const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8')) as EventAllowlist
  const serviceSource = readdirSync(join(root, 'services'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => sourceFiles(join(root, 'services', entry.name, 'src')))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')

  const discoveredNames = new Set<string>()
  for (const match of serviceSource.matchAll(/eventType\s*:\s*['"]([A-Z][A-Za-z0-9]+)['"]/g)) discoveredNames.add(match[1])
  for (const match of serviceSource.matchAll(/bindQueue\([^\n]*['"]domain-events['"]\s*,\s*['"]([A-Z][A-Za-z0-9]+)['"]/g)) discoveredNames.add(match[1])
  for (const match of serviceSource.matchAll(/const\s+EVENT_TYPE\s*=\s*['"]([A-Z][A-Za-z0-9]+)['"]/g)) discoveredNames.add(match[1])

  const allowlistedNames = new Set(allowlist.events.map((event) => event.name))
  const unknown = [...discoveredNames].filter((name) => !allowlistedNames.has(name))
  if (unknown.length > 0) throw new Error(`Cross-service events missing from allowlist: ${unknown.sort().join(', ')}`)
  const missingFromSource = allowlist.events.filter((event) => !serviceSource.includes(`'${event.name}'`) && !serviceSource.includes(`"${event.name}"`))
  if (missingFromSource.length > 0) throw new Error(`Allowlisted events missing from source: ${missingFromSource.map((event) => event.name).join(', ')}`)

  return allowlist.events.map((event) => ({
    id: `cross-service:event:${event.name}`,
    service: 'cross-service',
    kind: 'event',
    methodOrEvent: event.name,
    pathOrName: event.name,
    access: 'event',
    classification: 'indirect',
    source: 'scripts/backend-ui-event-allowlist.json',
  }))
}

export function discoverCapabilities(root: string): DiscoveredCapability[] {
  return [
    ...readServiceRoutes(root),
    ...readHealthRoutes(root),
    ...readSocketCapabilities(root),
    ...readEventCapabilities(root),
  ].sort((left, right) => left.id.localeCompare(right.id))
}

function defaultTask(capability: DiscoveredCapability): number {
  if (capability.classification === 'ops') return 10
  if (capability.kind === 'socket') return 13
  if (capability.kind === 'event') return 18
  if (capability.service === 'account-service') return 17
  if (capability.service === 'venue-booking-service') return 17
  if (capability.service === 'finance-service') return 17
  if (capability.service === 'matchmaking-service') return 18
  if (capability.service === 'community-service') return 18
  return 10
}

function defaultRow(capability: DiscoveredCapability, eventAllowlist: EventAllowlist): CapabilityManifestRow {
  if (capability.kind === 'event') {
    const event = eventAllowlist.events.find((entry) => entry.name === capability.pathOrName)
    if (!event) throw new Error(`Missing event metadata for ${capability.pathOrName}`)
    return { ...capability, ...event, classification: 'indirect' }
  }
  const task = defaultTask(capability)
  return {
    ...capability,
    surfaceId: capability.classification === 'ops' ? 'admin:system-health' : `planned:${capability.service}`,
    task,
    evidenceId: capability.classification === 'ops' ? 'browser:admin-system-health' : 'planned:role-aware-full-ui-ux-completion',
  }
}

export function validateManifest(
  discovered: DiscoveredCapability[],
  manifest: CapabilityManifest,
  options: { allowPlanned: boolean },
) {
  const discoveredById = new Map(discovered.map((capability) => [capability.id, capability]))
  const declaredById = new Map<string, CapabilityManifestRow>()
  const invalid: Array<{ row: CapabilityManifestRow; reasons: string[] }> = []

  for (const row of manifest.capabilities) {
    const reasons: string[] = []
    if (!row.id || !row.service || !row.methodOrEvent || !row.pathOrName || !row.source) reasons.push('missing identity field')
    if (!KIND_VALUES.has(row.kind)) reasons.push('invalid kind')
    if (!ACCESS_VALUES.has(row.access)) reasons.push('invalid access')
    if (!CLASSIFICATION_VALUES.has(row.classification)) reasons.push('invalid classification')
    if (!row.surfaceId || !row.evidenceId) reasons.push('missing surface/evidence')
    if (!Number.isInteger(row.task) || row.task < 1 || row.task > 20) reasons.push('invalid task')
    if (row.classification === 'planned' && !options.allowPlanned) reasons.push('planned capability remains')
    if (declaredById.has(row.id)) reasons.push('duplicate id')
    declaredById.set(row.id, row)

    const source = discoveredById.get(row.id)
    if (source && (
      source.service !== row.service
      || source.kind !== row.kind
      || source.methodOrEvent !== row.methodOrEvent
      || source.pathOrName !== row.pathOrName
      || source.access !== row.access
      || source.classification !== row.classification
      || source.source !== row.source
    )) reasons.push('source identity drift')
    if (reasons.length > 0) invalid.push({ row, reasons })
  }

  return {
    missing: discovered.filter((capability) => !declaredById.has(capability.id)),
    stale: manifest.capabilities.filter((row) => !discoveredById.has(row.id)),
    invalid,
  }
}

function runCli() {
  const root = process.cwd()
  const manifestPath = join(root, 'scripts', 'backend-ui-capabilities.json')
  const allowlist = JSON.parse(readFileSync(join(root, 'scripts', 'backend-ui-event-allowlist.json'), 'utf8')) as EventAllowlist
  const discovered = discoverCapabilities(root)

  if (process.argv.includes('--write')) {
    const existing = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, 'utf8')) as CapabilityManifest
      : { version: 2, capabilities: [] }
    const existingById = new Map(existing.capabilities.map((row) => [row.id, row]))
    const capabilities = discovered.map((capability) => {
      const old = existingById.get(capability.id)
      return old && old.methodOrEvent && old.pathOrName && old.access && old.task
        ? { ...old, ...capability }
        : defaultRow(capability, allowlist)
    })
    writeFileSync(manifestPath, `${JSON.stringify({ version: 2, capabilities }, null, 2)}\n`)
    console.log(`Wrote ${capabilities.length} capability rows.`)
    return
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as CapabilityManifest
  const result = validateManifest(discovered, manifest, { allowPlanned: process.argv.includes('--allow-planned') })
  const counts = discovered.reduce<Record<string, number>>((acc, capability) => {
    acc[capability.kind] = (acc[capability.kind] ?? 0) + 1
    return acc
  }, {})
  console.log(`Discovered ${counts.http ?? 0} HTTP, ${counts.socket ?? 0} Socket.IO and ${counts.event ?? 0} cross-service event capabilities; ${result.missing.length} missing, ${result.stale.length} stale, ${result.invalid.length} invalid manifest rows.`)
  if (result.missing.length > 0) console.error(`Missing: ${result.missing.map((row) => row.id).join(', ')}`)
  if (result.stale.length > 0) console.error(`Stale: ${result.stale.map((row) => row.id).join(', ')}`)
  if (result.invalid.length > 0) console.error(`Invalid: ${result.invalid.map(({ row, reasons }) => `${row.id} (${reasons.join('; ')})`).join(', ')}`)
  if (result.missing.length > 0 || result.stale.length > 0 || result.invalid.length > 0) process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) runCli()
