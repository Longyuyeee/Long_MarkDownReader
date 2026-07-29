import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('docs/evidence/e1b-odt-desktop')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'audit-manifest.json'), 'utf8')
  .catch(error => { throw new Error(`E1B desktop evidence is missing: ${error.message}`) }))
const failures = []
const checkpointFiles = [
  'word-light-normal-open-1280.jpg',
  'libreoffice-light-compact-open-760.jpg',
  'word-dark-normal-search-1280.jpg',
  'libreoffice-dark-compact-locator-760.jpg',
]
const closureFiles = [
  ...checkpointFiles,
  'wps-light-normal-search-1280.jpg',
  'wps-dark-compact-locator-760.jpg',
]
const closureCandidate = manifest.gateMode === 'closure-candidate'
const expectedFiles = closureCandidate ? closureFiles : checkpointFiles
const expectedProducers = closureCandidate
  ? 'microsoft-word-16,wps-writer,libreoffice-writer'
  : 'microsoft-word-16,libreoffice-writer'
if (manifest.schemaVersion !== 1 || manifest.stage !== 'E1B') failures.push('manifest stage header is invalid')
if (manifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') failures.push('evidence must come from real Tauri WebView2')
if (!['checkpoint', 'closure-candidate'].includes(manifest.gateMode)) failures.push('gate mode is invalid')
if ((manifest.producerMatrix || []).join(',') !== expectedProducers) failures.push('producer matrix is incomplete')
if ((manifest.viewportMatrix || []).join(',') !== 'normal-1280x820,compact-760x720') failures.push('normal and compact viewport evidence is incomplete')
if ((manifest.themeMatrix || []).join(',') !== 'professional-light,professional-dark') failures.push('professional theme evidence is incomplete')
if (manifest.productExposure !== 'preview-route-only-unregistered' || manifest.writeEnabled !== false) failures.push('E1B exposure boundary drift')
if ((manifest.scenarios || []).length !== expectedFiles.length || manifest.scenarios.some(scenario => scenario.status !== 'passed')) {
  failures.push(`${expectedFiles.length} desktop scenarios are incomplete`)
}
for (const id of [
  'available-producers-open-read-only',
  'normal-and-compact-layouts-without-overflow',
  'professional-light-and-dark-themes',
  'document-search-centers-exact-block',
  'route-locator-centers-exact-block',
  'product-exposure-remains-disabled',
  'microsoft-word-16-source-unchanged',
  'libreoffice-writer-source-unchanged',
]) {
  const check = manifest.checks?.find(candidate => candidate.id === id)
  if (check?.status !== 'passed') failures.push(`missing passed check ${id}`)
  if (id.endsWith('-source-unchanged') && check?.sourceUnchanged !== true) failures.push(`${id} lacks immutable byte evidence`)
}
if (closureCandidate) {
  for (const id of [
    'wps-writer-source-unchanged',
    'wps-document-search-centers-exact-block',
    'wps-route-locator-centers-exact-block',
  ]) {
    const check = manifest.checks?.find(candidate => candidate.id === id)
    if (check?.status !== 'passed') failures.push(`missing passed check ${id}`)
    if (id === 'wps-writer-source-unchanged' && check?.sourceUnchanged !== true) {
      failures.push('WPS source lacks immutable byte evidence')
    }
  }
}
if (manifest.checks?.find(check => check.id === 'product-exposure-remains-disabled')?.odtRegistered !== false) {
  failures.push('.odt registration must remain disabled')
}
if ((manifest.evidenceFiles || []).join(',') !== expectedFiles.join(',')) failures.push('screenshot inventory is invalid')
const actualJpegs = (await fs.readdir(root))
  .filter(file => file.toLowerCase().endsWith('.jpg'))
  .sort()
if (actualJpegs.join(',') !== [...expectedFiles].sort().join(',')) failures.push('evidence directory contains stale or unexpected screenshots')
for (const file of expectedFiles) {
  const stat = await fs.stat(path.join(root, file)).catch(() => null)
  if (!stat || stat.size < 15_000) failures.push(`screenshot is missing or too small: ${file}`)
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log(`E1B ODT desktop evidence passed in ${manifest.gateMode} mode: ${manifest.producerMatrix.length} producers, 2 layouts, 2 themes, search, locator, and immutable sources.`)
