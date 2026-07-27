import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/c3c3-pptx-relations')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8'))
const failures = []
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') {
  failures.push('desktop environment must be real Tauri WebView2 via CDP')
}
const requiredChecks = new Set([
  'pptx-slide-is-a-knowledge-object',
  'slide-selection-updates-shared-relation-context',
  'slide-centered-graph-action-and-source-unchanged',
])
for (const check of manifest.checks || []) {
  if (check.status === 'passed') requiredChecks.delete(check.id)
  if (check.id === 'slide-centered-graph-action-and-source-unchanged' && check.sourceUnchanged !== true) {
    failures.push('source PPTX must remain unchanged')
  }
}
if (requiredChecks.size) failures.push(`missing checks: ${[...requiredChecks].join(', ')}`)
for (const file of manifest.evidenceFiles || []) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 20_000) failures.push(`missing or undersized evidence: ${file}`)
}
if ((manifest.evidenceFiles || []).length !== 2) failures.push('expected exactly 2 C3C3 screenshots')
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C3C3 desktop evidence passed: 3 checks and 2 real Tauri WebView2 screenshots.')
