import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/a3r-json-creation')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8')
  .catch(error => { throw new Error(`A3R evidence is missing: ${error.message}`) }))
const failures = []
const expectedFiles = [
  'a3r-create-options-1280.jpg',
  'a3r-json-saved-tree-1280.jpg',
  'a3r-json-search-960.jpg',
  'a3r-json-recent-capability-960.jpg',
]
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('A3R evidence must come from the real Tauri desktop')
if ((manifest.formats || []).join(',') !== 'json,jsonc') failures.push('A3R must cover JSON and JSONC')
if (manifest.initialContent !== '{}\n') failures.push('A3R must use the minimum valid initial source')
if ((manifest.createdFiles || []).join(',') !== '未命名数据.json,未命名数据 1.json,未命名配置.jsonc') failures.push('A3R created-file inventory is invalid')
if (manifest.firstFilePreservedAfterDuplicateCreate !== true) failures.push('A3R duplicate creation must preserve the first file')
if ((manifest.viewportMatrix || []).join(',') !== '1280x820,960x720') failures.push('A3R must cover normal and compact layouts')
for (const field of ['jsonSha256', 'jsoncSha256']) {
  if (!/^[a-f0-9]{64}$/.test(manifest[field] || '')) failures.push(`A3R ${field} is invalid`)
}
for (const id of [
  'unified-create-menu-lists-json-and-jsonc',
  'minimum-valid-json-template-opens-specialized-workspace',
  'first-edit-save-and-reopen',
  'duplicate-name-does-not-overwrite',
  'jsonc-comment-and-trailing-comma-fidelity',
  'json-content-search-result',
  'json-and-jsonc-recent-management',
  'normal-and-compact-layouts',
]) {
  if (!manifest.checks?.some(check => check.id === id && check.status === 'passed')) failures.push(`missing passed check ${id}`)
}
if ((manifest.evidenceFiles || []).join(',') !== expectedFiles.join(',')) failures.push('A3R screenshot inventory is invalid')
for (const file of expectedFiles) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 20_000) failures.push(`A3R screenshot is missing or too small: ${file}`)
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('A3R desktop evidence passed: unified JSON/JSONC creation, safe save/reopen, duplicate protection, search, recent management, and 4 screenshots.')
