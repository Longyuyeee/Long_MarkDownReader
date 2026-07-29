import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const json = relativePath => JSON.parse(read(relativePath))
const failures = []
const matrix = json('docs/evidence/x3-b2-xlsx-array-producers/matrix.json')
const capabilities = json('shared/xlsx-formula-capabilities.json')
const environment = json('docs/evidence/x3-b6-xlsx-array-producer-closure/environment.json')
const packageJson = json('package.json')
const environmentAudit = read('scripts/audit-x3-b6-array-producer-environment.ps1')
const closure = read('scripts/close-x3-b6-array-producer-matrix.ps1')
const closureTest = read('scripts/test-x3-b6-array-producer-matrix-closure.ps1')

if (matrix.stage !== 'X3-B6' || matrix.status !== 'partial' ||
    matrix.verifiedProducers !== 1 || matrix.requiredProducers !== 3) {
  failures.push('current X3-B6 matrix must truthfully remain partial 1/3')
}
const pairClosure = matrix.evidenceHandoff?.atomicPairClosure
if (pairClosure?.status !== 'verified' || pairClosure?.requiredStartingMatrix !== '1/3' ||
    pairClosure?.candidateValidation !== 'isolated-3/3' ||
    pairClosure?.destinationPromotion !== 'atomic-with-rollback' ||
    pairClosure?.brokenSecondBundleLeavesDestinationUnchanged !== true) {
  failures.push('X3-B6 matrix atomic pair closure contract drifted')
}
if (environment.schemaVersion !== 1 || environment.stage !== 'X3-B6' ||
    environment.status !== 'blocked_environment' ||
    environment.microsoftExcel?.status !== 'compatible_server_not_microsoft_excel' ||
    environment.microsoftExcel?.trustedMicrosoftExcelAvailable !== false ||
    !/kingsoft|WPS Office|\\et\.exe/i.test(environment.microsoftExcel?.localServer || '') ||
    environment.libreOfficeCalc?.status !== 'missing' ||
    environment.safety?.activatedComApplication !== false ||
    environment.safety?.openedWorkbook !== false ||
    environment.safety?.writesUserFile !== false) {
  failures.push('X3-B6 read-only environment evidence drifted')
}
for (const id of ['microsoft-excel', 'libreoffice-calc']) {
  if (fs.existsSync(path.join(root, `src-tauri/tests/fixtures/workbook/array-formula-${id}.xlsx`)) ||
      fs.existsSync(path.join(root, `src-tauri/tests/fixtures/workbook/array-formula-${id}.json`))) {
    failures.push(`${id} real evidence must not exist while the checked-in matrix is 1/3`)
  }
}
for (const token of ['Get-ItemPropertyValue', 'LocalServer32', 'compatible_server_not_microsoft_excel', 'LONGEDIT_LIBREOFFICE_ROOT', 'activatedComApplication = $false', 'openedWorkbook = $false', 'writesUserFile = $false']) {
  if (!environmentAudit.includes(token)) failures.push(`environment audit token missing: ${token}`)
}
for (const token of ['ConfirmTrustedProducers', 'import-x3-b5-array-producer-evidence.ps1', 'stagingFixtureRoot', 'isolated candidate', 'verifiedProducers', 'File]::Replace', 'matrixBackup', 'capabilityBackup', 'Refusing to overwrite existing X3-B6 evidence']) {
  if (!closure.includes(token)) failures.push(`atomic closure token missing: ${token}`)
}
for (const token of ['synthetic-closure-test-only', 'valid pair', 'broken second bundle', 'member digest drifted', 'changed destination state', 'verifiedProducers', 'fullProducerMatrixVerified']) {
  if (!closureTest.includes(token)) failures.push(`closure test token missing: ${token}`)
}
const capabilityClosure = capabilities.arrayFormulaReadContract?.producerEvidenceHandoff?.atomicPairClosure
if (capabilities.arrayFormulaReadContract?.stage !== 'X3-B6' ||
    capabilityClosure?.status !== 'verified' ||
    capabilityClosure?.requiredStartingVerifiedProducerCount !== 1 ||
    capabilityClosure?.isolatedCandidateVerifiedProducerCount !== 3 ||
    capabilityClosure?.destinationPromotion !== 'atomic-with-rollback' ||
    capabilityClosure?.environmentStatus !== 'blocked_environment') {
  failures.push('X3-B6 capability atomic closure contract drifted')
}
for (const command of ['audit:x3-b6-array-environment', 'close:x3-b6-array-matrix', 'check:x3-b6-array-matrix-closure', 'check:x3-b6-array-release']) {
  if (!packageJson.scripts?.[command]) failures.push(`npm command missing: ${command}`)
}

if (failures.length) throw new Error(`X3-B6 array release gate failed:\n- ${failures.join('\n- ')}`)
console.log('X3-B6 array release gate OK: environment truthfully blocked, valid pair closes isolated 3/3, broken pair leaves destination at 1/3')
