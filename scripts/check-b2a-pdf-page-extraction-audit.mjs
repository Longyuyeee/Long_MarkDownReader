import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/b2a-pdf-page-extraction')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8')
  .catch(error => { throw new Error(`B2A evidence is missing: ${error.message}`) }))
const failures = []
const expectedFiles = [
  'b2a-range-plan-1280.jpg',
  'b2a-isolated-preview-1280.jpg',
  'b2a-saved-reopen-960.jpg',
]
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('B2A evidence must come from the real Tauri desktop')
if (manifest.sourcePages !== 2 || manifest.outputPages !== 1 || (manifest.selectedPages || []).join(',') !== '2') failures.push('B2A page mapping evidence is invalid')
if (manifest.sourceOverwriteAllowed !== false) failures.push('B2A must preserve the source read-only boundary')
if ((manifest.viewportMatrix || []).join(',') !== '1280x820,960x720') failures.push('B2A must cover normal and compact layouts')
if (!/^[a-f0-9]{64}$/.test(manifest.sourceSha256 || '') || !/^[a-f0-9]{64}$/.test(manifest.outputSha256 || '')) failures.push('B2A source/output digests are invalid')
for (const id of [
  'range-expression-applies-one-page-plan',
  'dedicated-extraction-preview-verified',
  'atomic-create-new-save',
  'saved-output-reopens-with-one-page',
  'normal-and-compact-layouts-without-overflow',
  'source-pdf-bytes-unchanged',
]) {
  if (!manifest.checks?.some(check => check.id === id && check.status === 'passed')) failures.push(`missing passed check ${id}`)
}
if ((manifest.evidenceFiles || []).join(',') !== expectedFiles.join(',')) failures.push('B2A screenshot inventory is invalid')
for (const file of expectedFiles) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 20_000) failures.push(`B2A screenshot is missing or too small: ${file}`)
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('B2A desktop evidence passed: page 2 extraction, isolated preview, atomic save, one-page reopen, source safety, and 3 screenshots.')
