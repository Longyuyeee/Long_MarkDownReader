import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/c3d-pptx-producer-visual')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8'))
const failures = []
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') {
  failures.push('desktop environment must be real Tauri WebView2 via CDP')
}
if (manifest.producerCount !== 3) failures.push('C3D evidence must cover all three PPTX producers')
if ((manifest.viewportMatrix || []).join(',') !== '1280x820,960x720,760x720') {
  failures.push('C3D evidence must cover the three required viewport sizes')
}
if ((manifest.themeMatrix || []).join(',') !== 'professional-light,professional-dark') {
  failures.push('C3D evidence must cover light and dark professional themes')
}
const requiredChecks = new Set([
  'three-producers-open-in-library-without-overflow',
  'wps-group-connector-table-render',
  'wps-note-search-locates-in-library',
  'wps-compact-dark-slideshow-renders',
  'wps-reopen-restores-structured-workspace',
  'microsoft-powerpoint-16-source-unchanged',
  'wps-presentation-source-unchanged',
  'libreoffice-impress-source-unchanged',
])
for (const check of manifest.checks || []) {
  if (check.status === 'passed') requiredChecks.delete(check.id)
  if (check.id.endsWith('-source-unchanged') && check.sourceUnchanged !== true) {
    failures.push(`${check.id} must prove immutable fixture bytes`)
  }
}
if (requiredChecks.size) failures.push(`missing checks: ${[...requiredChecks].join(', ')}`)
for (const file of manifest.evidenceFiles || []) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 15_000) failures.push(`missing or undersized evidence: ${file}`)
}
if ((manifest.evidenceFiles || []).length !== 5) failures.push('expected exactly 5 C3D screenshots')
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C3D desktop evidence passed: 8 checks, 3 producers, 3 sizes, 2 themes, and 5 screenshots.')
