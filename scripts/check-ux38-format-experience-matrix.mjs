import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const registry = JSON.parse(fs.readFileSync('shared/file-formats.json', 'utf8'))
const matrix = JSON.parse(fs.readFileSync('shared/ux38-format-experience-matrix.json', 'utf8'))
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const fail = message => { throw new Error(`UX-38 format experience matrix rejected: ${message}`) }
const expectedDimensions = ['open', 'load', 'states', 'edit', 'save', 'return', 'tab', 'theme', 'scale', 'keyboard', 'performance', 'errors']
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

if (matrix.schemaVersion !== 1 || matrix.stage !== 'UX-38' || matrix.status !== 'accepted-bounded' || matrix.releaseCandidate !== false) fail('matrix identity or release boundary drift')
if (JSON.stringify(matrix.dimensions) !== JSON.stringify(expectedDimensions)) fail('the 12 required experience dimensions changed')
const allowed = new Set(matrix.allowedStatuses)
if (allowed.size !== 5 || !['accepted', 'partial', 'referenced', 'pending', 'not-applicable'].every(value => allowed.has(value))) fail('status vocabulary drift')

for (const [profileId, profile] of Object.entries(matrix.profiles || {})) {
  if (!Array.isArray(profile.evidence) || !profile.evidence.length) fail(`profile ${profileId} has no evidence reference`)
  for (const dimension of expectedDimensions) if (!allowed.has(profile.dimensions?.[dimension])) fail(`profile ${profileId} has invalid ${dimension} status`)
  if (Object.keys(profile.dimensions || {}).length !== expectedDimensions.length) fail(`profile ${profileId} dimension count drift`)
}

const registryById = new Map(registry.formats.map(format => [format.id, format]))
const postClosureFormats = new Set(['raster-image', 'video'])
const matrixIds = new Set()
for (const format of matrix.formats || []) {
  if (!registryById.has(format.id) || matrixIds.has(format.id)) fail(`unknown or duplicate format ${format.id}`)
  if (!format.cohort || !matrix.profiles[format.profile]) fail(`format ${format.id} has no valid cohort/profile`)
  matrixIds.add(format.id)
}
if (matrixIds.size !== registry.formats.length - postClosureFormats.size) fail(`UX-38 baseline covers ${matrixIds.size}/${registry.formats.length - postClosureFormats.size} baseline formats`)
for (const id of registryById.keys()) if (!matrixIds.has(id) && !postClosureFormats.has(id)) fail(`UX-38 baseline format omitted: ${id}`)
for (const id of postClosureFormats) if (!registryById.has(id) || matrixIds.has(id)) fail(`post-closure format boundary drift: ${id}`)

const lightweight = matrix.formats.filter(format => format.profile === 'ux38a-lightweight')
if (lightweight.length !== 24) fail(`UX-38A lightweight cohort drift: ${lightweight.length}`)
const evidenceRoot = 'docs/evidence/ux38a-lightweight-formats'
const manifest = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'manifest.json'), 'utf8'))
const evidence = JSON.parse(fs.readFileSync(path.join(evidenceRoot, manifest.evidenceFile), 'utf8'))
if (manifest.stage !== 'UX-38A' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('UX-38A evidence is not accepted')
if (manifest.sourceCommit !== evidence.sourceCommit || !/^[0-9a-f]{40}$/.test(manifest.sourceCommit)) fail('UX-38A source commit drift')
if (sha256(path.join(evidenceRoot, manifest.evidenceFile)) !== manifest.evidenceSha256) fail('UX-38A evidence hash drift')
if (evidence.formatCount !== 24 || evidence.passedFormatCount !== 24 || evidence.sourceFilesUnchanged !== true) fail('UX-38A format or source integrity drift')
if (evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false || evidence.maxLoadMilliseconds > 5000) fail('UX-38A runtime or performance drift')
if (evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('UX-38A privacy or release boundary drift')
if (/([A-Za-z]:\\Users\\|\\\\\?\\[A-Za-z]:)/.test(JSON.stringify(evidence))) fail('UX-38A evidence contains an unredacted local path')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 5) fail('UX-38A screenshot count drift')
for (const screenshot of manifest.screenshots) {
  const file = path.join(evidenceRoot, screenshot.file)
  if (fs.statSync(file).size !== screenshot.bytes || screenshot.bytes < 60_000 || sha256(file) !== screenshot.sha256) fail(`UX-38A screenshot integrity drift: ${screenshot.file}`)
}

if (!packageJson.scripts?.['check:ux38-format-experience-matrix']) fail('package checker command missing')
if (!packageJson.scripts?.['audit:ux38a-lightweight-formats']) fail('desktop audit command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38-format-experience-matrix')) fail('checker is outside the development audit chain')

console.log(`UX-38 format experience matrix passed: ${matrixIds.size} formats and ${expectedDimensions.length} dimensions are accepted with explicit capability boundaries.`)
