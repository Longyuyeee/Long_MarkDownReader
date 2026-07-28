import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = path.resolve('docs/evidence/c5c-pptx-slide-lifecycle')
const artifactRoot = path.resolve('fixtures/pptx/output-reopen')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8')
  .catch(error => { throw new Error(`C5C evidence is missing: ${error.message}`) }))
const failures = []
const operations = ['add', 'copy', 'delete', 'reorder']

if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('C5C evidence must come from the real Tauri desktop')
if (manifest.producer !== 'wps-presentation') failures.push('C5C evidence must use the real WPS fixture')
if (manifest.saveMode !== 'copy' || manifest.sourceOverwriteAllowed !== false) failures.push('C5C must retain create-new-only saving')
if ((manifest.operations || []).join(',') !== operations.join(',')) failures.push('C5C operation set is invalid')
if (manifest.externalProducerReopenRequired !== true) failures.push('C5C must retain the external producer reopen dependency')
if ((manifest.viewportMatrix || []).join(',') !== '1280x820,960x720') failures.push('C5C evidence must cover normal and compact Library widths')

for (const operation of operations) {
  const expectedFile = `c5c-${operation}-copy.pptx`
  const output = (manifest.outputs || []).find(item => item.operation === operation)
  const artifact = await fs.readFile(path.join(artifactRoot, expectedFile)).catch(() => null)
  if (!output || output.file !== expectedFile || !artifact
    || artifact.length !== output.bytes
    || createHash('sha256').update(artifact).digest('hex') !== output.sha256) {
    failures.push(`C5C artifact disagrees with desktop evidence: ${expectedFile}`)
  }
}
if ((manifest.outputs || []).length !== operations.length) failures.push('C5C must retain exactly four output artifacts')

const requiredChecks = new Set([
  'four-slide-lifecycle-modes',
  'safe-target-enumeration',
  'relationship-and-content-type-whitelist',
  'notes-preserving-copy',
  'identity-preserving-reorder',
  'preview-reports-no-source-write',
  'four-atomic-create-new-copies',
  'structural-and-semantic-reopen-verified',
  'compact-library-workspace-without-overflow',
  'wps-source-bytes-unchanged',
])
for (const check of manifest.checks || []) {
  if (check.status === 'passed') requiredChecks.delete(check.id)
  if (check.id === 'wps-source-bytes-unchanged' && check.sourceUnchanged !== true) failures.push('C5C must prove source bytes are unchanged')
}
if (requiredChecks.size) failures.push(`missing checks: ${[...requiredChecks].join(', ')}`)
for (const file of manifest.evidenceFiles || []) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 15_000) failures.push(`missing or undersized evidence: ${file}`)
}
if ((manifest.evidenceFiles || []).length !== 3) failures.push('expected exactly 3 C5C screenshots')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C5C desktop evidence passed: 10 checks, 4 outputs, 2 viewport sizes, and 3 screenshots.')
