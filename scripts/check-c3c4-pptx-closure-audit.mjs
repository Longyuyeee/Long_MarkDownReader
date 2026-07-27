import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/c3c4-pptx-closure')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8'))
const failures = []
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') {
  failures.push('desktop environment must be real Tauri WebView2 via CDP')
}
const requiredChecks = new Set([
  'missing-index-uses-live-pptx-fallback',
  'rebuild-persists-pptx-objects-and-relations',
  'search-locator-relation-graph-return-closes',
  'stale-index-is-visible-and-falls-back-live',
  'deleted-index-falls-back-with-source-bytes-unchanged',
])
for (const check of manifest.checks || []) {
  if (check.status === 'passed') requiredChecks.delete(check.id)
  if (check.id === 'deleted-index-falls-back-with-source-bytes-unchanged' && check.sourceUnchanged !== true) {
    failures.push('source PPTX bytes must remain unchanged')
  }
}
if (requiredChecks.size) failures.push(`missing checks: ${[...requiredChecks].join(', ')}`)
for (const file of manifest.evidenceFiles || []) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 20_000) failures.push(`missing or undersized evidence: ${file}`)
}
if ((manifest.evidenceFiles || []).length !== 4) failures.push('expected exactly 4 C3C4 screenshots')
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C3C4 desktop evidence passed: 5 checks and 4 real Tauri WebView2 screenshots.')
