import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/c5d-pptx-release-closure')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8')
  .catch(error => { throw new Error(`C5D evidence is missing: ${error.message}`) }))
const failures = []
const expectedFiles = [
  'professional-light-normal-1280.jpg',
  'professional-light-compact-960.jpg',
  'professional-dark-normal-1280.jpg',
  'professional-dark-compact-960.jpg',
]
if (manifest.schemaVersion !== 1) failures.push('manifest schema must be version 1')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('C5D evidence must come from the real Tauri desktop')
if (manifest.producer !== 'wps-presentation') failures.push('C5D evidence must use the real WPS fixture')
if (manifest.sourceOverwriteAllowed !== false) failures.push('C5D must preserve the source read-only boundary')
if ((manifest.viewportMatrix || []).join(',') !== 'normal-1280x820,compact-960x720') failures.push('C5D must cover normal and compact layouts')
if ((manifest.themeMatrix || []).join(',') !== 'professional-light,professional-dark') failures.push('C5D must cover professional light and dark themes')
const capability = manifest.capability || {}
if (capability.edit !== 'supported'
  || capability.level !== 'basic-edit'
  || capability.label !== '基础编辑副本'
  || capability.saveMode !== 'copy'
  || capability.writer !== 'pptx') failures.push('C5D capability registry evidence is incomplete')
if ((manifest.scenarios || []).length !== 4 || manifest.scenarios.some(scenario => scenario.status !== 'passed')) failures.push('C5D four-scenario matrix is incomplete')
for (const id of [
  'registry-basic-copy-edit',
  'workspace-capability-and-source-boundary',
  'normal-and-compact-layouts-without-overflow',
  'professional-light-and-dark-themes',
  'wps-source-bytes-unchanged',
]) {
  if (!manifest.checks?.some(check => check.id === id && check.status === 'passed')) failures.push(`missing passed check ${id}`)
}
if ((manifest.evidenceFiles || []).join(',') !== expectedFiles.join(',')) failures.push('C5D screenshot inventory is invalid')
for (const file of expectedFiles) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 20_000) failures.push(`C5D screenshot is missing or too small: ${file}`)
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C5D desktop evidence passed: basic copy-edit registry, 2 layouts, 2 themes, source safety, and 4 screenshots.')
