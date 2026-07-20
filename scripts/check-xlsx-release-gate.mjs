import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const gate = JSON.parse(read('shared/xlsx-release-gate.json'))
const matrix = JSON.parse(read('shared/xlsx-compatibility-matrix.json'))
const fixture = JSON.parse(read('src-tauri/tests/fixtures/workbook/compatibility-baseline.json'))
const engine = read('src-tauri/src/commands/workbook.rs')
const publicMatrix = read('docs/XLSX_Public_Compatibility_Matrix.md')
const statement = read('docs/XLSX_Release_Compatibility_Statement.md')

const fail = message => { throw new Error(`XLSX release gate: ${message}`) }
if (gate.schemaVersion !== 1 || gate.profileId !== 'xlsx-progressive-editing-v1') fail('invalid profile header')
if (gate.engineId !== matrix.engineId || !engine.includes(`engine_id: "${gate.engineId}"`)) fail('engine id drift')
if (!fs.existsSync(path.join(root, gate.complexFixture.path))) fail('complex fixture is missing')
if (fixture.sheets.length < gate.complexFixture.minimumSheets) fail('complex fixture sheet coverage is too small')
if (Object.values(fixture.documentFeatures).filter(Boolean).length < gate.complexFixture.minimumDocumentFeatures) fail('complex fixture feature coverage is too small')
if (!gate.differentialGate.requireNoAddedParts || !gate.differentialGate.requireNoRemovedParts || !gate.differentialGate.preserveAllOtherPartsByteForByte) fail('package differential protection weakened')
for (const part of ['xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
  if (!gate.differentialGate.contentAndStyleAllowedChangedParts.includes(part)) fail(`missing allowed changed part ${part}`)
}
for (const field of ['inspect', 'readPage', 'patch', 'total']) {
  if (!Number.isInteger(gate.performanceBudgetsMs[field]) || gate.performanceBudgetsMs[field] <= 0) fail(`invalid ${field} performance budget`)
}
if (gate.performanceWorkload.rows < 10000 || gate.performanceWorkload.columns < 12 || gate.performanceWorkload.sheets < 4) fail('performance workload was weakened')
if (!Array.isArray(gate.prohibitedClaims) || gate.prohibitedClaims.length < 3) fail('prohibited compatibility claims are incomplete')
for (const claim of gate.prohibitedClaims) {
  if (!publicMatrix.includes(claim)) fail(`public matrix does not disclose prohibited claim: ${claim}`)
  if (!statement.includes(claim)) fail(`release statement does not disclose prohibited claim: ${claim}`)
}
if (!statement.includes(gate.profileId) || !statement.includes(gate.publicClaim)) fail('release statement profile or public claim drift')
if (fixture.currentEngineExpectations.xlsxRoundTrip !== 'planned') fail('full XLSX round-trip must remain planned')
if (!engine.includes('complex_fixture_package_diff_is_allowlisted_and_lossless') || !engine.includes('complex_workbook_performance_stays_within_release_budget')) fail('executable S6-15 evidence missing')

console.log(`XLSX release gate OK: ${gate.profileId}, ${gate.performanceWorkload.rows}x${gate.performanceWorkload.columns} workload`)
