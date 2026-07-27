import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/c4a-pptx-edit-baseline')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8'))
const failures = []
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') {
  failures.push('C4A evidence must come from the real Tauri WebView2 desktop')
}
if (manifest.producer !== 'wps-presentation') failures.push('C4A desktop evidence must use the real WPS fixture')
if ((manifest.viewportMatrix || []).join(',') !== '1280x820,960x720') {
  failures.push('C4A evidence must cover normal and compact Library widths')
}
const requiredChecks = new Set([
  'edit-preparation-remains-in-library-reader',
  'isolated-baseline-visible-and-verified',
  'responsive-details-panel-without-overflow',
  'wps-source-bytes-unchanged',
])
for (const check of manifest.checks || []) {
  if (check.status === 'passed') requiredChecks.delete(check.id)
  if (check.id === 'wps-source-bytes-unchanged' && check.sourceUnchanged !== true) {
    failures.push('C4A must prove the source WPS PPTX is byte-identical')
  }
}
if (requiredChecks.size) failures.push(`missing checks: ${[...requiredChecks].join(', ')}`)
for (const file of manifest.evidenceFiles || []) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 15_000) failures.push(`missing or undersized evidence: ${file}`)
}
if ((manifest.evidenceFiles || []).length !== 2) failures.push('expected exactly 2 C4A screenshots')
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C4A desktop evidence passed: 4 checks, 2 viewport sizes, and 2 screenshots.')
