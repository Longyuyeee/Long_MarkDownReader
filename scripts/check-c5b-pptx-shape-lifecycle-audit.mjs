import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = path.resolve('docs/evidence/c5b-pptx-shape-lifecycle')
const artifactRoot = path.resolve('fixtures/pptx/output-reopen')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8')
  .catch(error => { throw new Error(`C5B evidence is missing: ${error.message}`) }))
const failures = []

if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('C5B evidence must come from the real Tauri desktop')
if (manifest.producer !== 'wps-presentation') failures.push('C5B evidence must use the real WPS fixture')
if (manifest.saveMode !== 'copy' || manifest.sourceOverwriteAllowed !== false) failures.push('C5B must retain create-new-only saving')
if ((manifest.allowedShapeTypes || []).join(',') !== 'rectangle,ellipse,line') failures.push('C5B shape allowlist is invalid')
if (manifest.externalProducerReopenRequired !== true) failures.push('C5B must retain the external producer reopen dependency')
if ((manifest.viewportMatrix || []).join(',') !== '1280x820,960x720') failures.push('C5B evidence must cover normal and compact Library widths')

const expectedOutputs = new Map([
  ['rectangle', 'c5b-rectangle-copy.pptx'],
  ['ellipse', 'c5b-ellipse-copy.pptx'],
  ['line', 'c5b-line-copy.pptx'],
  ['delete', 'c5b-delete-copy.pptx'],
])
if ((manifest.outputs || []).length !== expectedOutputs.size) failures.push('C5B must retain exactly four output artifacts')
for (const output of manifest.outputs || []) {
  if (expectedOutputs.get(output.operation) !== output.file) {
    failures.push(`unexpected C5B output identity: ${output.operation}/${output.file}`)
    continue
  }
  expectedOutputs.delete(output.operation)
  const artifact = await fs.readFile(path.join(artifactRoot, output.file)).catch(() => null)
  if (!artifact || artifact.length !== output.bytes || createHash('sha256').update(artifact).digest('hex') !== output.sha256) {
    failures.push(`C5B artifact disagrees with desktop evidence: ${output.file}`)
  }
}
if (expectedOutputs.size) failures.push(`missing C5B outputs: ${[...expectedOutputs.values()].join(', ')}`)

const requiredChecks = new Set([
  'three-shape-types-enumerated',
  'bounded-geometry-and-style-controls',
  'single-slide-part-add-preview',
  'safe-delete-target-enumeration',
  'single-slide-part-delete-preview',
  'preview-reports-no-source-write',
  'four-atomic-create-new-copies',
  'structural-and-semantic-reopen-verified',
  'compact-library-workspace-without-overflow',
  'wps-source-bytes-unchanged',
])
for (const check of manifest.checks || []) {
  if (check.status === 'passed') requiredChecks.delete(check.id)
  if (check.id === 'wps-source-bytes-unchanged' && check.sourceUnchanged !== true) {
    failures.push('C5B must prove the source is byte-identical')
  }
}
if (requiredChecks.size) failures.push(`missing checks: ${[...requiredChecks].join(', ')}`)

for (const file of manifest.evidenceFiles || []) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 15_000) failures.push(`missing or undersized evidence: ${file}`)
}
if ((manifest.evidenceFiles || []).length !== 3) failures.push('expected exactly 3 C5B screenshots')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C5B desktop evidence passed: 10 checks, 4 outputs, 2 viewport sizes, and 3 screenshots.')
