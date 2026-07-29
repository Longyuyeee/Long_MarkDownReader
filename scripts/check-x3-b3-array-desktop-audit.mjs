import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const evidenceRoot = path.join(root, 'docs/evidence/x3-b3-xlsx-array-desktop')
const manifestPath = path.join(evidenceRoot, 'audit-manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const failures = []
const requiredChecks = [
  'professional-light-theme',
  'dynamic-cache-type-summary',
  'dynamic-array-anchor-selection',
  'array-calculation-and-edit-blocked',
  'light-layout-contained',
  'professional-dark-theme',
  'legacy-cache-type-summary',
  'legacy-array-anchor-selection',
  'compact-layout-contained',
  'source-fixture-byte-unchanged',
]
if (manifest.schemaVersion !== 1 || manifest.stage !== 'X3-B3') failures.push('manifest header drift')
if (!manifest.sourceUnchanged) failures.push('source fixture changed during desktop audit')
for (const check of requiredChecks) if (!manifest.checks?.includes(check)) failures.push(`missing check: ${check}`)
if (manifest.evidenceFiles?.length !== 2 || new Set(manifest.evidenceFiles).size !== 2) failures.push('expected two unique screenshots')
for (const file of manifest.evidenceFiles || []) {
  const target = path.join(evidenceRoot, file)
  if (!fs.existsSync(target) || fs.statSync(target).size < 20_000) failures.push(`screenshot missing or too small: ${file}`)
}
const source = path.join(root, manifest.source)
if (!fs.existsSync(source)) failures.push('source fixture missing')
else if (createHash('sha256').update(fs.readFileSync(source)).digest('hex') !== manifest.sourceSha256) failures.push('source fixture hash drift')
if (manifest.boundaries?.expectedSpillCalculation !== false || manifest.boundaries?.arrayWriteback !== false || manifest.boundaries?.conflictFixtureVisualEvidence !== false) failures.push('desktop boundary drift')
if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log(`X3-B3 desktop evidence OK: ${requiredChecks.length} checks, 2 themes/viewports, 2 screenshots, source unchanged.`)
