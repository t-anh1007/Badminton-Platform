import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const manifestPath = join(root, 'scripts/backend-ui-capabilities.json')
const serviceRoots = readdirSync(join(root, 'services'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.endsWith('-service'))
  .map((entry) => entry.name)

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : entry.name.endsWith('.ts') ? [path] : []
  })
}

function readRouteCapabilities() {
  return serviceRoots.flatMap((service) => {
    const routeDirectory = join(root, 'services', service, 'src', 'routes')
    return files(routeDirectory).flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      const matches = [...source.matchAll(/router\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)/g)]
      return matches.map((match) => ({
        id: `${service}:${match[1].toUpperCase()}:${match[2]}`,
        service,
        kind: 'http',
        method: match[1].toUpperCase(),
        path: match[2],
        source: relative(root, file).replaceAll('\\', '/'),
      }))
    })
  }).sort((left, right) => left.id.localeCompare(right.id))
}

const discovered = readRouteCapabilities()
if (process.argv.includes('--write')) {
  const manifest = {
    version: 1,
    capabilities: discovered.map((capability) => ({
      ...capability,
      classification: 'planned',
      surfaceId: `planned:${capability.service}`,
      evidenceId: 'planned:role-aware-full-ui-ux-completion',
    })),
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Wrote ${discovered.length} capability rows.`)
  process.exit(0)
}

const allowPlanned = process.argv.includes('--allow-planned')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const declared = new Map(manifest.capabilities.map((capability: { id: string }) => [capability.id, capability]))
const unclassified = discovered.filter((capability) => !declared.has(capability.id))
const invalidRows = manifest.capabilities.filter((capability: { surfaceId?: string; evidenceId?: string; classification?: string }) =>
  !capability.surfaceId || !capability.evidenceId || (capability.classification === 'planned' && !allowPlanned),
)

for (const capability of discovered.filter((capability) => declared.has(capability.id))) {
  const row = declared.get(capability.id) as { source?: string }
  if (row.source !== capability.source) unclassified.push(capability)
}

console.log(`Discovered ${discovered.length} HTTP capabilities; ${unclassified.length} unclassified; ${invalidRows.length} invalid manifest rows.`)
if (unclassified.length > 0 || invalidRows.length > 0) process.exitCode = 1
