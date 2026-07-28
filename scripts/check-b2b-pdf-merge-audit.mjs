import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/b2b-pdf-merge')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8')
  .catch(error => { throw new Error(`B2B evidence is missing: ${error.message}`) }))
const failures = []
const expectedFiles = [
  'b2b-ordered-inputs-1280.jpg',
  'b2b-isolated-merge-1280.jpg',
  'b2b-saved-reopen-960.jpg',
]
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('B2B evidence must come from the real Tauri desktop')
if ((manifest.inputOrder || []).join(',') !== 'B2B Secondary.pdf,B2B Primary.pdf') failures.push('B2B input ordering evidence is invalid')
if ((manifest.inputPages || []).join(',') !== '2,2' || manifest.outputPages !== 4) failures.push('B2B page total evidence is invalid')
if (manifest.sourceOverwriteAllowed !== false) failures.push('B2B must preserve every source PDF')
if ((manifest.viewportMatrix || []).join(',') !== '1280x820,960x720') failures.push('B2B must cover normal and compact layouts')
for (const field of ['primarySha256', 'secondarySha256', 'outputSha256']) {
  if (!/^[a-f0-9]{64}$/.test(manifest[field] || '')) failures.push(`B2B ${field} is invalid`)
}
for (const id of [
  'multiple-library-inputs-added',
  'explicit-input-order-applied',
  'isolated-merge-verified',
  'atomic-create-new-save',
  'four-page-output-reopened',
  'normal-and-compact-layouts-without-overflow',
  'all-source-pdf-bytes-unchanged',
]) {
  if (!manifest.checks?.some(check => check.id === id && check.status === 'passed')) failures.push(`missing passed check ${id}`)
}
if ((manifest.evidenceFiles || []).join(',') !== expectedFiles.join(',')) failures.push('B2B screenshot inventory is invalid')
for (const file of expectedFiles) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 20_000) failures.push(`B2B screenshot is missing or too small: ${file}`)
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('B2B desktop evidence passed: ordered multi-input merge, isolated verification, atomic save, four-page reopen, source safety, and 3 screenshots.')
