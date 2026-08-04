import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const matrix = JSON.parse(read('shared/release-capability-matrix.json'))
const registry = JSON.parse(read('shared/file-formats.json'))
const tauri = JSON.parse(read('src-tauri/tauri.conf.json'))
const frontend = read('src/config/releaseCapabilities.ts')
const view = read('src/views/ReleaseCapabilitiesView.vue')
const settings = read('src/views/SettingsView.vue')
const router = read('src/router/index.ts')
const workflow = read('.github/workflows/quality-gate.yml')
const failures = []

if (matrix.schemaVersion !== 1 || !['R1', 'R2'].includes(matrix.stage)) failures.push('invalid R1+ matrix header')
if (matrix.releaseCandidate !== false) failures.push('R1 must not claim release-candidate status')
if (matrix.appVersion !== tauri.version) failures.push('matrix and Tauri app versions must match')
if (matrix.formatRegistrySchemaVersion !== registry.schemaVersion) failures.push('registry schema version drift')

const profileIds = new Set()
for (const profile of matrix.profiles || []) {
  if (!profile.id || profileIds.has(profile.id)) failures.push(`invalid or duplicate profile ${profile.id}`)
  profileIds.add(profile.id)
  if (!profile.dependency || !profile.sourcePolicy || !profile.privacyBoundary
    || !Array.isArray(profile.knownLimitations) || !profile.knownLimitations.length
    || profile.knownLimitations.some(item => typeof item !== 'string' || !item.trim())) {
    failures.push(`incomplete release profile ${profile.id}`)
  }
}

const registryIds = new Set(registry.formats.map(format => format.id))
const mappedIds = new Set()
for (const mapping of matrix.formats || []) {
  if (!registryIds.has(mapping.id) || mappedIds.has(mapping.id)) failures.push(`invalid format mapping ${mapping.id}`)
  mappedIds.add(mapping.id)
  if (!profileIds.has(mapping.profile)) failures.push(`unknown profile ${mapping.profile}`)
  if (!['verified', 'verified-with-limitations', 'external-dependency'].includes(mapping.readiness)) {
    failures.push(`invalid readiness ${mapping.id}`)
  }
}
if (mappedIds.size !== registryIds.size || [...registryIds].some(id => !mappedIds.has(id))) {
  failures.push('release matrix must map every registered format exactly once')
}

const mappingFor = id => matrix.formats.find(mapping => mapping.id === id)
for (const format of registry.formats) {
  const mapping = mappingFor(format.id)
  if (!mapping) continue
  if (format.userCapability.saveMode === 'copy' && mapping.profile !== 'office-copy') {
    failures.push(`${format.id} copy-only format must use office-copy`)
  }
  if (format.userCapability.level === 'external-open'
    && !['legacy-conversion', 'wps-external'].includes(mapping.profile)) {
    failures.push(`${format.id} external-open dependency is understated`)
  }
  if (format.userCapability.level === 'external-open' && mapping.readiness !== 'external-dependency') {
    failures.push(`${format.id} external dependency readiness is overstated`)
  }
}

for (const [id, profile] of [
  ['env', 'protected-local-overwrite'],
  ['log', 'readonly-log'],
  ['pdf', 'pdf-sidecar'],
  ['docx', 'office-copy'],
  ['pptx', 'office-copy'],
  ['ods', 'odf-preview'],
  ['odp', 'odf-preview'],
  ['workbook', 'workbook-bounded'],
]) {
  if (mappingFor(id)?.profile !== profile) failures.push(`${id} release boundary drift`)
}

const gates = new Map((matrix.externalGates || []).map(gate => [gate.id, gate]))
if (gates.get('e1b-wps-odt')?.evidence !== '2/3' || gates.get('e1b-wps-odt')?.status !== 'partial') {
  failures.push('E1B external gate must remain partial 2/3')
}
if (gates.get('x3-b6-array-producers')?.evidence !== '1/3' || gates.get('x3-b6-array-producers')?.status !== 'partial') {
  failures.push('X3-B6 external gate must remain partial 1/3')
}

const requireText = (source, value, message) => {
  if (!source.includes(value)) failures.push(message)
}
requireText(frontend, '../../shared/release-capability-matrix.json', 'frontend must consume the shared release matrix')
requireText(frontend, 'matrix.formats.length !== FILE_FORMATS.length', 'frontend must reject incomplete matrices')
requireText(view, 'RELEASE_CAPABILITY_ROWS', 'release matrix view must render the shared rows')
requireText(view, 'knownLimitations', 'release matrix view must expose known limitations')
requireText(view, 'privacyBoundary', 'release matrix view must expose privacy boundaries')
requireText(view, 'RELEASE_EXTERNAL_GATES', 'release matrix view must expose external gates')
requireText(settings, "name: 'ReleaseCapabilities'", 'settings must link to the release matrix')
requireText(router, "name: 'ReleaseCapabilities'", 'release matrix route is missing')
requireText(workflow, 'node-version: 22', 'Quality Gate must retain the Node.js 22 build baseline')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}

const counts = matrix.formats.reduce((result, item) => {
  result[item.readiness] = (result[item.readiness] || 0) + 1
  return result
}, {})
console.log(`R1 release capability matrix passed: ${mappedIds.size} formats, ${profileIds.size} profiles, ${JSON.stringify(counts)}`)
