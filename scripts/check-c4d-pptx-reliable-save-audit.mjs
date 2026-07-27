import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/c4d-pptx-reliable-save')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8'))
const failures = []
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('C4D evidence must come from the real Tauri WebView2 desktop')
if (manifest.producer !== 'wps-presentation') failures.push('C4D desktop evidence must use the real WPS fixture')
if (manifest.saveMode !== 'copy' || manifest.sourceOverwriteAllowed !== false) failures.push('C4D evidence must preserve the create-new-only save boundary')
if (manifest.externalProducerReopenRequired !== true) failures.push('C4D evidence must keep external producer reopen assigned to C4E')
if ((manifest.viewportMatrix || []).join(',') !== '1280x820,960x720') failures.push('C4D evidence must cover normal and compact Library widths')
const requiredChecks = new Set([
  'verified-preview-unlocks-save-copy',
  'atomic-create-new-copy-succeeds',
  'structural-reopen-verified',
  'semantic-reopen-verified',
  'saved-target-locked-against-repeat-overwrite',
  'saved-copy-reopens-in-library-workspace',
  'compact-library-workspace-without-overflow',
  'wps-source-bytes-unchanged',
])
for (const check of manifest.checks || []) {
  if (check.status === 'passed') requiredChecks.delete(check.id)
  if (check.id === 'wps-source-bytes-unchanged' && check.sourceUnchanged !== true) failures.push('C4D must prove the source WPS PPTX is byte-identical')
}
if (requiredChecks.size) failures.push(`missing checks: ${[...requiredChecks].join(', ')}`)
for (const file of manifest.evidenceFiles || []) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 15_000) failures.push(`missing or undersized evidence: ${file}`)
}
if ((manifest.evidenceFiles || []).length !== 2) failures.push('expected exactly 2 C4D screenshots')
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C4D desktop evidence passed: 8 checks, 2 viewport sizes, and 2 screenshots.')
