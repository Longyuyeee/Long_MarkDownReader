import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = path.resolve('docs/evidence/c5a-pptx-image-replacement')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8')
  .catch(error => { throw new Error(`C5A evidence is missing: ${error.message}`) }))
const failures = []
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('C5A evidence must come from the real Tauri desktop')
if (manifest.producer !== 'wps-presentation') failures.push('C5A evidence must use the real WPS fixture')
if (manifest.saveMode !== 'copy' || manifest.sourceOverwriteAllowed !== false) failures.push('C5A must retain create-new-only saving')
if (!['image/png', 'image/jpeg'].includes(manifest.replacementMimeType)) failures.push('C5A replacement format is not allowlisted')
if (!(manifest.replacementBytes > 0 && manifest.replacementBytes <= 8 * 1024 * 1024)) failures.push('C5A replacement size is outside the release bound')
if (!(manifest.outputBytes > 1_000) || !/^[0-9a-f]{64}$/.test(manifest.outputSha256 || '')) failures.push('C5A output evidence is incomplete')
const artifact = await fs.readFile(path.resolve('fixtures/pptx/output-reopen/c5a-image-copy.pptx')).catch(() => null)
if (!artifact || artifact.length !== manifest.outputBytes || createHash('sha256').update(artifact).digest('hex') !== manifest.outputSha256) failures.push('C5A committed output artifact does not match the desktop evidence')
if (manifest.externalProducerReopenRequired !== true) failures.push('C5A must retain the external producer reopen dependency')
if ((manifest.viewportMatrix || []).join(',') !== '1280x820,960x720') failures.push('C5A evidence must cover normal and compact Library widths')
const requiredChecks = new Set([
  'unshared-png-jpeg-targets-only',
  'same-format-bounded-file-selection',
  'single-media-part-preview-verified',
  'preview-reports-no-source-write',
  'atomic-create-new-copy-succeeds',
  'structural-and-semantic-reopen-verified',
  'saved-copy-reopens-in-library-workspace',
  'compact-library-workspace-without-overflow',
  'wps-source-bytes-unchanged',
])
for (const check of manifest.checks || []) {
  if (check.status === 'passed') requiredChecks.delete(check.id)
  if (check.id === 'wps-source-bytes-unchanged' && check.sourceUnchanged !== true) failures.push('C5A must prove the source is byte-identical')
}
if (requiredChecks.size) failures.push(`missing checks: ${[...requiredChecks].join(', ')}`)
for (const file of manifest.evidenceFiles || []) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 15_000) failures.push(`missing or undersized evidence: ${file}`)
}
if ((manifest.evidenceFiles || []).length !== 2) failures.push('expected exactly 2 C5A screenshots')
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C5A desktop evidence passed: 9 checks, 2 viewport sizes, and 2 screenshots.')
