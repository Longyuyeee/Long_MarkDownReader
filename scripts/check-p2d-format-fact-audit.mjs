import fs from 'node:fs'
import path from 'node:path'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const pkg = readJson('package.json')
const registry = readJson('shared/file-formats.json')
const matrix = readJson('shared/release-capability-matrix.json')
const degradation = readJson('shared/safe-degradation-contract.json')
const community = readJson('shared/v1-community-release-policy.json')
const lifecycle = readJson('shared/windows-lifecycle-policy.json')
const readiness = readJson('shared/windows-release-readiness-policy.json')
const r5PolicyFiles = [
  'frontend-release-hardening-policy.json',
  'desktop-startup-performance-policy.json',
  'r5c-route-performance-smoke-policy.json',
  'r5d-production-route-smoke-preflight-policy.json',
  'r5e-runtime-route-smoke-policy.json',
  'r5f-safe-tauri-runtime-policy.json',
  'r5g-desktop-artifact-smoke-policy.json',
  'r5h-current-installer-evidence-policy.json',
  'r5i-isolated-install-lifecycle-policy.json',
  'r5j-installed-artifact-smoke-policy.json',
  'r5k-windows-matrix-handoff-policy.json',
  'r5l-management-rollback-closure-policy.json',
  'r5m-final-release-closure-policy.json',
  'r5n-external-release-execution-policy.json',
]
const router = fs.readFileSync('src/router/index.ts', 'utf8')
const capabilitiesView = fs.readFileSync('src/views/ReleaseCapabilitiesView.vue', 'utf8')
const routeNames = new Set([...router.matchAll(/name:\s*'([^']+)'/g)].map(match => match[1]))
const matrixById = new Map(matrix.formats.map(item => [item.id, item]))
const profileById = new Map(matrix.profiles.map(item => [item.id, item]))
const laneMembership = new Map()
const failures = []

for (const lane of degradation.lanes) {
  for (const id of lane.formats) {
    if (laneMembership.has(id)) failures.push(`format appears in multiple safety lanes: ${id}`)
    laneMembership.set(id, lane)
  }
  for (const evidence of lane.evidence) {
    if (!fs.existsSync(evidence.path)) {
      failures.push(`safety evidence file missing: ${evidence.path}`)
      continue
    }
    const source = fs.readFileSync(evidence.path, 'utf8')
    for (const marker of evidence.markers) if (!source.includes(marker)) failures.push(`safety evidence marker missing: ${evidence.path} -> ${marker}`)
  }
}

const rows = registry.formats.map(format => {
  const mapping = matrixById.get(format.id)
  const profile = mapping && profileById.get(mapping.profile)
  const lane = laneMembership.get(format.id)
  if (!mapping) failures.push(`release mapping missing: ${format.id}`)
  if (!profile) failures.push(`release profile missing: ${format.id}`)
  if (!lane) failures.push(`safe degradation lane missing: ${format.id}`)
  if (!routeNames.has(format.routeName)) failures.push(`registered route missing: ${format.id} -> ${format.routeName}`)
  if (lane && !lane.saveModes.includes(format.userCapability.saveMode)) failures.push(`save mode not admitted by lane: ${format.id}`)
  if (lane && mapping && !lane.profiles.includes(mapping.profile)) failures.push(`release profile not admitted by lane: ${format.id}`)
  if (format.adapters.writer && format.userCapability.saveMode === 'none') failures.push(`writer exposed with no-save user boundary: ${format.id}`)
  if (!format.adapters.writer && format.userCapability.saveMode !== 'none') failures.push(`save boundary exposed without writer: ${format.id}`)
  if (format.userCapability.level === 'external-open' && profile?.dependency === 'none') failures.push(`external-open format lacks dependency disclosure: ${format.id}`)
  return {
    id: format.id,
    label: format.label,
    extensions: format.extensions,
    routeName: format.routeName,
    capabilityLevel: format.userCapability.level,
    saveMode: format.userCapability.saveMode,
    writer: format.adapters.writer,
    releaseProfile: mapping?.profile,
    readiness: mapping?.readiness,
    dependency: profile?.dependency,
    safetyLane: lane?.id,
  }
})

const versions = {
  package: pkg.version,
  capabilityMatrix: matrix.appVersion,
  safeDegradation: degradation.appVersion,
  communityRelease: community.appVersion,
  windowsLifecycle: lifecycle.appVersion,
  windowsReadiness: readiness.appVersion,
  ...Object.fromEntries(r5PolicyFiles.map(file => [`r5:${file}`, readJson(`shared/${file}`).appVersion])),
}
if (new Set(Object.values(versions)).size !== 1) failures.push(`living version facts drifted: ${JSON.stringify(versions)}`)
if (registry.formats.length !== 43 || matrix.formats.length !== 43 || laneMembership.size !== 43) failures.push('43-format coverage is incomplete')
if (new Set(registry.formats.flatMap(format => format.extensions)).size !== 91) failures.push('91-extension coverage is incomplete')
if (!capabilitiesView.includes('RELEASE_CAPABILITY_ROWS') || !capabilitiesView.includes('row.format.userCapability.description') || !capabilitiesView.includes('row.knownLimitations')) failures.push('format capability UI is not rendering the audited facts')

const countBy = key => Object.fromEntries([...new Set(rows.map(row => row[key]))].sort().map(value => [value, rows.filter(row => row[key] === value).length]))
const evidence = {
  schemaVersion: 1,
  stage: 'P2-D',
  status: failures.length ? 'rejected' : 'accepted',
  expected: { formatCount: 43, extensionCount: 91, uniqueRouteProfileAndSafetyFacts: true, livingVersionsAligned: true },
  actual: {
    formatCount: rows.length,
    extensionCount: new Set(registry.formats.flatMap(format => format.extensions)).size,
    versions,
    readinessCounts: countBy('readiness'),
    saveModeCounts: countBy('saveMode'),
    safetyLaneCounts: countBy('safetyLane'),
    rows,
  },
  failures,
  passed: failures.length === 0,
}
const output = path.resolve('docs/evidence/p2d-format-fact-audit')
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, 'format-fact-audit.json'), `${JSON.stringify(evidence, null, 2)}\n`)
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`P2-D format fact audit passed: ${rows.length} formats, ${evidence.actual.extensionCount} extensions, ${laneMembership.size} safety mappings.`)
