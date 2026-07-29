import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const json = relativePath => JSON.parse(read(relativePath))
const failures = []
const matrix = json('docs/evidence/x3-b2-xlsx-array-producers/matrix.json')
const capabilities = json('shared/xlsx-formula-capabilities.json')
const packageJson = json('package.json')
const exporter = read('scripts/export-x3-b5-array-producer-evidence.ps1')
const importer = read('scripts/import-x3-b5-array-producer-evidence.ps1')
const rejectionMatrix = read('scripts/test-x3-b5-array-evidence-bundle-rejections.ps1')
const libreOfficeRunner = read('scripts/x3-b5-libreoffice-array-roundtrip.py')
const rustCommand = read('src-tauri/src/commands/workbook.rs')
const rustBinary = read('src-tauri/src/bin/xlsx-array-audit.rs')

if (matrix.stage !== 'X3-B6' || !['partial', 'verified'].includes(matrix.status) ||
    matrix.verifiedProducers < 1 || matrix.verifiedProducers > 3 || matrix.requiredProducers !== 3 ||
    (matrix.status === 'verified') !== (matrix.verifiedProducers === 3)) {
  failures.push('X3-B5 producer matrix state is inconsistent')
}
if (matrix.evidenceHandoff?.status !== 'ready' || matrix.evidenceHandoff?.exactBundleMemberCount !== 3 ||
    matrix.evidenceHandoff?.verifiedRejectionCases !== 5 || matrix.evidenceHandoff?.longEditSemanticReparseRequired !== true) {
  failures.push('X3-B5 matrix evidence handoff boundary drifted')
}
for (const id of ['microsoft-excel', 'libreoffice-calc']) {
  const entry = matrix.producers?.find(producer => producer.id === id)
  const fixtureExists = fs.existsSync(path.join(root, `src-tauri/tests/fixtures/workbook/array-formula-${id}.xlsx`))
  const manifestExists = fs.existsSync(path.join(root, `src-tauri/tests/fixtures/workbook/array-formula-${id}.json`))
  if (entry?.status === 'blocked_environment' && (fixtureExists || manifestExists)) {
    failures.push(`${id} blocked producer must not have evidence targets`)
  } else if (entry?.status === 'verified' && (!fixtureExists || !manifestExists)) {
    failures.push(`${id} verified producer evidence targets are incomplete`)
  } else if (!['blocked_environment', 'verified'].includes(entry?.status)) {
    failures.push(`${id} producer state is invalid`)
  }
}
for (const token of ['microsoft-excel', 'libreoffice-calc', 'Get-TrustedExcelIdentity', 'Microsoft Office', 'LibreOffice', 'native_save', 'reparse_longedit_semantics', 'manifest.json', 'producer.json', 'CreateNew']) {
  if (!exporter.includes(token)) failures.push(`exporter token missing: ${token}`)
}
for (const token of ['ConfirmTrustedProducer', 'must contain exactly', 'baseline.sha256', 'completedGates', 'genuine Microsoft Excel', 'genuine LibreOffice Calc', 'xlsx-array-audit', 'Refusing to overwrite existing producer evidence', 'File]::Replace']) {
  if (!importer.includes(token)) failures.push(`importer token missing: ${token}`)
}
for (const token of ['extra_member', 'baseline_drift', 'missing_gate', 'output_digest_drift', 'producer_identity_spoof', 'changed the matrix', 'created a target']) {
  if (!rejectionMatrix.includes(token)) failures.push(`rejection token missing: ${token}`)
}
for (const token of ['UnoUrlResolver', 'ReadOnly', 'document.store()', 'Array Boundary']) {
  if (!libreOfficeRunner.includes(token)) failures.push(`LibreOffice runner token missing: ${token}`)
}
if (!rustCommand.includes('generate_workbook_array_audit_report') || !rustCommand.includes('array_semantics_verified') ||
    !rustBinary.includes('generate_workbook_array_audit_report')) {
  failures.push('LongEdit array semantic audit binary is missing')
}
const handoff = capabilities.arrayFormulaReadContract?.producerEvidenceHandoff
if (capabilities.arrayFormulaReadContract?.stage !== 'X3-B6' || handoff?.status !== 'ready' ||
    handoff?.supportedProducerIds?.join(',') !== 'microsoft-excel,libreoffice-calc' ||
    handoff?.rejectionValidation?.verifiedCaseCount !== 5 || handoff?.trustedMachineConfirmationRequired !== true ||
    capabilities.arrayFormulaReadContract?.verifiedProducerCount !== matrix.verifiedProducers ||
    capabilities.arrayFormulaReadContract?.fullProducerMatrixVerified !== (matrix.verifiedProducers === 3)) {
  failures.push('X3-B5 capability handoff contract drifted')
}
for (const command of ['export:x3-b5-array-evidence', 'import:x3-b5-array-evidence', 'check:x3-b5-array-evidence-handoff', 'check:x3-b5-array-evidence-rejections']) {
  if (!packageJson.scripts?.[command]) failures.push(`npm command missing: ${command}`)
}

if (failures.length) throw new Error(`X3-B5 array evidence handoff gate failed:\n- ${failures.join('\n- ')}`)
console.log('X3-B5 array evidence handoff OK: 1/3 public boundary retained, Excel/LibreOffice portable closure path ready, 5 rejection cases bound')
