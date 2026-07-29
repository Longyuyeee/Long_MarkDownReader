import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const evidenceRoot = path.join(root, 'docs/evidence/x3-b4-xlsx-array-conflict-desktop')
const manifest = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'audit-manifest.json'), 'utf8'))
const fixtureManifest = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tests/fixtures/workbook/array-formula-conflict-diagnostic.json'), 'utf8'))
const failures = []
const requiredChecks = [
  'professional-light-theme',
  'conflict-cache-summary',
  'distinct-diagnostic-buttons',
  'array-calculation-and-edit-blocked',
  'conflict-address-exact-location',
  'light-layout-contained',
  'professional-dark-theme',
  'error-cache-address-exact-location',
  'error-and-conflict-addresses-remain-distinct',
  'diagnostic-buttons-remain-visible',
  'compact-layout-contained',
  'source-fixture-byte-unchanged',
]
if (manifest.schemaVersion !== 1 || manifest.stage !== 'X3-B4') failures.push('manifest header drift')
if (!manifest.sourceUnchanged) failures.push('source fixture changed during desktop audit')
for (const check of requiredChecks) if (!manifest.checks?.includes(check)) failures.push(`missing check: ${check}`)
if (manifest.evidenceFiles?.length !== 2 || new Set(manifest.evidenceFiles).size !== 2) failures.push('expected two unique screenshots')
for (const file of manifest.evidenceFiles || []) {
  const target = path.join(evidenceRoot, file)
  if (!fs.existsSync(target) || fs.statSync(target).size < 20_000) failures.push(`screenshot missing or too small: ${file}`)
}
const source = path.join(root, manifest.source)
if (!fs.existsSync(source)) failures.push('source fixture missing')
else {
  const digest = createHash('sha256').update(fs.readFileSync(source)).digest('hex')
  if (digest !== manifest.sourceSha256 || digest !== fixtureManifest.sha256) failures.push('source fixture hash drift')
}
if (fixtureManifest.stage !== 'X3-B4'
  || fixtureManifest.expectedConflictCells?.join(',') !== 'D3'
  || fixtureManifest.expectedErrorCacheCells?.join(',') !== 'D4'
  || fixtureManifest.expectedSpillStatus !== 'potential_conflict') failures.push('fixture semantic contract drift')
if (manifest.boundaries?.expectedSpillCalculation !== false
  || manifest.boundaries?.arrayWriteback !== false
  || manifest.boundaries?.conflictFixtureVisualEvidence !== true
  || manifest.boundaries?.addressTruncationCoveredByRustAndUiContract !== true) failures.push('desktop boundary drift')
if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log(`X3-B4 desktop evidence OK: ${requiredChecks.length} checks, 2 exact locators, 2 screenshots, source unchanged.`)
