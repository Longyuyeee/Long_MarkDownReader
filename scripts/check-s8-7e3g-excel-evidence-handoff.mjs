import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const json = relativePath => JSON.parse(read(relativePath))
const failures = []
const environment = json('docs/evidence/s8-7e3g-xlsx-pivot-multi-axis-roundtrip/excel-environment.json')
const matrix = json('docs/evidence/s8-7e3g-xlsx-pivot-multi-axis-roundtrip/matrix.json')
const capabilities = json('shared/xlsx-linked-data-capabilities.json')
const packageJson = json('package.json')
const environmentAudit = read('scripts/audit-s8-7e3g-excel-environment.ps1')
const verifier = read('scripts/verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1')
const exporter = read('scripts/export-s8-7e3g-excel-evidence-bundle.ps1')
const importer = read('scripts/import-s8-7e3g-excel-evidence-bundle.ps1')

if (environment.schemaVersion !== 1 || environment.stage !== 'S8-7E3G-D') failures.push('Excel environment report identity drifted')
if (environment.status !== 'compatible_server_not_microsoft_excel' || environment.trustedMicrosoftExcelAvailable !== false) {
  failures.push('current Excel environment must remain rejected as a compatible non-Microsoft server')
}
if (!/kingsoft|WPS Office|\\et\.exe/i.test(`${environment.localServer} ${environment.identity?.path}`)) {
  failures.push('Excel environment report no longer proves the WPS COM redirect')
}
if (environment.openedWorkbook !== false || environment.writesUserFile !== false) failures.push('Excel environment audit write boundary drifted')
for (const gate of ['excel_com_activation', 'local_server_is_excel_exe', 'application_path_is_microsoft_office', 'local_server_is_not_kingsoft_or_wps']) {
  if (!environment.requiredIdentityGates?.includes(gate)) failures.push(`Excel identity gate missing: ${gate}`)
}

if (matrix.status !== 'partial' || matrix.complete !== false || matrix.verifiedCount !== 2 || matrix.requiredCount !== 3) {
  failures.push('S8-7E3G matrix must stay partial 2/3 until real Microsoft Excel evidence is imported')
}
const excel = matrix.producers?.find(producer => producer.id === 'microsoft-excel')
if (excel?.status !== 'pending_environment') failures.push('Microsoft Excel producer must remain pending')
if (matrix.environment?.microsoftExcel?.status !== 'compatible_server_not_microsoft_excel' ||
    !/kingsoft|WPS Office|\\et\.exe/i.test(matrix.environment?.microsoftExcel?.localServer || '')) {
  failures.push('matrix Excel environment identity evidence drifted')
}
if (fs.existsSync(path.join(root, 'fixtures/xlsx/output-reopen/s8-7e3g-microsoft-excel.xlsx'))) {
  failures.push('Microsoft Excel output must not exist before trusted evidence import')
}

for (const token of ['Excel.Application', 'LocalServer32', 'compatible_server_not_microsoft_excel', 'openedWorkbook = $false', 'writesUserFile = $false']) {
  if (!environmentAudit.includes(token)) failures.push(`Excel environment audit token missing: ${token}`)
}
for (const token of ['Get-TrustedMicrosoftExcelServer', 'EXCEL\\.EXE', 'kingsoft|WPS Office|\\\\et\\.exe', 'compatible_server_not_microsoft_excel']) {
  if (!verifier.includes(token)) failures.push(`Excel verifier identity token missing: ${token}`)
}
for (const token of ['trustedMicrosoftExcelAvailable', 'verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1', 'manifest.json', 'producer.json', 'CreateNew', 'trustedMachineConfirmationRequired']) {
  if (!exporter.includes(token)) failures.push(`Excel evidence exporter token missing: ${token}`)
}
for (const token of ['ZipArchive', 'requiredMembers', 'Refusing to overwrite existing Microsoft Excel evidence', 'baseline.sha256', 'completedGates', 'xlsx-pivot-audit-copy', 'File]::Replace', 'verifiedCount = 3']) {
  if (!importer.includes(token)) failures.push(`Excel evidence importer token missing: ${token}`)
}

const handoff = capabilities.pivotAudit?.writebackAudit?.multiLevelAxisProducerRoundTrip?.excelEvidenceHandoff
if (handoff?.stage !== 'S8-7E3G-D' || handoff?.status !== 'ready' || handoff?.environmentStatus !== 'compatible_server_not_microsoft_excel') {
  failures.push('Excel evidence handoff capability state drifted')
}
if (handoff?.requiredBundleMembers?.join(',') !== 'manifest.json,producer.json,s8-7e3g-microsoft-excel.xlsx' ||
    handoff?.trustedMachineConfirmationRequired !== true || handoff?.baselineDigestBound !== true ||
    handoff?.longEditSemanticReparseRequired !== true || handoff?.existingEvidenceOverwrite !== 'blocked') {
  failures.push('Excel evidence handoff capability boundary drifted')
}
if (!packageJson.scripts?.['audit:s8-7e3g-excel-environment'] ||
    !packageJson.scripts?.['export:s8-7e3g-excel-evidence'] ||
    !packageJson.scripts?.['import:s8-7e3g-excel-evidence'] ||
    !packageJson.scripts?.['check:s8-7e3g-excel-evidence-handoff']) {
  failures.push('Excel evidence handoff npm commands are missing')
}

if (failures.length) throw new Error(`S8-7E3G-D Excel evidence handoff gate failed:\n- ${failures.join('\n- ')}`)
console.log('S8-7E3G-D Excel evidence handoff OK: WPS COM redirect rejected, portable 3-member closure path ready')
