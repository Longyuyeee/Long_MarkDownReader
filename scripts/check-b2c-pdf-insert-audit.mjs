import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/b2c-pdf-insert')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8')
  .catch(error => { throw new Error(`B2C evidence is missing: ${error.message}`) }))
const failures = []
const expectedFiles = [
  'b2c-insert-plan-1280.jpg',
  'b2c-isolated-insert-1280.jpg',
  'b2c-saved-reopen-960.jpg',
]
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('B2C evidence must come from the real Tauri desktop')
if (manifest.baseFile !== 'B2C Base.pdf' || manifest.sourceFile !== 'B2C Source.pdf') failures.push('B2C fixture identity is invalid')
if (manifest.basePages !== 2 || (manifest.sourcePages || []).join(',') !== '1' || manifest.insertAfterPage !== 1 || manifest.outputPages !== 3) failures.push('B2C insertion mapping evidence is invalid')
if (manifest.sourceOverwriteAllowed !== false) failures.push('B2C must preserve both source PDFs')
if ((manifest.viewportMatrix || []).join(',') !== '1280x820,960x720') failures.push('B2C must cover normal and compact layouts')
for (const field of ['baseSha256', 'sourceSha256', 'outputSha256']) {
  if (!/^[a-f0-9]{64}$/.test(manifest[field] || '')) failures.push(`B2C ${field} is invalid`)
}
for (const id of [
  'library-source-selected',
  'source-page-range-and-boundary-applied',
  'isolated-insert-verified',
  'atomic-create-new-save',
  'three-page-output-reopened',
  'normal-and-compact-layouts-without-overflow',
  'both-source-pdf-bytes-unchanged',
]) {
  if (!manifest.checks?.some(check => check.id === id && check.status === 'passed')) failures.push(`missing passed check ${id}`)
}
if ((manifest.evidenceFiles || []).join(',') !== expectedFiles.join(',')) failures.push('B2C screenshot inventory is invalid')
for (const file of expectedFiles) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 20_000) failures.push(`B2C screenshot is missing or too small: ${file}`)
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('B2C desktop evidence passed: explicit source range and boundary, isolated insertion, atomic save, three-page reopen, source safety, and 3 screenshots.')
