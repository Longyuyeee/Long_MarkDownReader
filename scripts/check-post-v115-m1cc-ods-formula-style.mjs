import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const auditPath = path.join(workspace, 'docs', 'evidence', 'post-v115-m1cc-ods-formula-style', 'audit.json')
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))

const failures = []
if (audit.stage !== 'M1C-C-ODS-formula-and-style-feasibility' || audit.status !== 'passed') failures.push('stage/status')
if (audit.actual?.cachedValueAfterLongEditPatch !== '50') failures.push('stale LongEdit formula cache evidence')
if (audit.actual?.libreOfficeA2 !== '84.5' || audit.actual?.libreOfficeB2 !== '92.5') failures.push('LibreOffice recalculation evidence')
if (audit.actual?.styleInheritance !== 'ceLongEditProbe -> Good -> Status -> Default' || audit.actual?.roundtripStyleName !== 'ceLongEditProbe(Good)') failures.push('named style roundtrip evidence')
if (audit.actual?.roundtripFillColor !== 'FFCCFFCC' || audit.actual?.roundtripFontColor !== 'FF006600') failures.push('named style color semantics')
if (!audit.actual?.sourceUnchanged || audit.actual?.sourceBeforeSha256 !== audit.actual?.sourceAfterSha256) failures.push('source preservation')
if (!audit.decision?.formulaEditingRemainsReadOnly || !audit.decision?.existingNamedStyleAssignmentCandidate) failures.push('bounded decision')
if (audit.decision?.customStyleCreationCandidate || audit.decision?.nextStage !== 'M1C-D-ODS-existing-named-style-assignment') failures.push('next-stage boundary')

if (failures.length) {
  console.error(`M1C-C contract failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('M1C-C ODS formula/style evidence contract passed.')
