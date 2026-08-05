import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const fail = message => {
  console.error(message)
  process.exit(1)
}

const packageJson = json('package.json')
const policy = json('shared/r5l-management-rollback-closure-policy.json')
const preflight = json('docs/evidence/r5l-management-rollback/preflight.json')
const importedRoot = 'docs/evidence/r5k-windows-matrix/imported'
const bundle = json(`${importedRoot}/r5k-bundle-manifest.json`)
const evidence = json(`${importedRoot}/management-backup-index-evidence.json`)
const capture = read('scripts/capture-r5l-management-rollback-smoke.mjs')
const lifecycle = read('scripts/run-r5i-isolated-install-lifecycle.ps1')
const sandbox = read('scripts/new-r5i-windows-sandbox-config.ps1')
const exporter = read('scripts/export-r5k-windows-evidence-bundle.ps1')
const importer = read('scripts/import-r5k-windows-evidence-bundle.ps1')
const auditDoc = read('docs/U2O_Hosted_Unsigned_Lifecycle_Closure_Audit_2026-08-01.md')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5L' || policy.appVersion !== packageJson.version) {
  fail('R5L policy identity mismatch.')
}
if (policy.currentStatus !== 'generic-hosted-management-recovery-proven-client-matrix-pending' ||
    policy.releaseCandidate !== false || policy.nextStage !== 'R5M') {
  fail('R5L truth boundary mismatch.')
}
if (policy.requiredChecks.length !== 7 || new Set(policy.requiredChecks).size !== 7) {
  fail('R5L required check set mismatch.')
}
for (const [key, value] of Object.entries(policy.implementation)) {
  if (value !== true) fail(`R5L implementation gate must pass: ${key}`)
}
for (const key of [
  'windows11EvidenceImported',
  'windows10EvidenceImported',
  'signedArtifactRuntimeProven',
  'currentPromotionEligible',
]) {
  if (policy.releaseGate[key] !== false) fail(`R5L must not overstate ${key}.`)
}
if (policy.releaseGate.managementRollbackProven !== true || policy.releaseGate.knowledgeIndexRecoveryProven !== true) fail('R5L hosted recovery gates must pass.')
if (preflight.stage !== 'R5L' || preflight.appVersion !== packageJson.version ||
    preflight.currentStatus !== policy.currentStatus ||
    preflight.currentHost.hostInstallerMutationAllowed !== false ||
    preflight.evidenceContract.managementBackupZipExported !== false ||
    preflight.evidenceContract.requiredCheckCount !== policy.requiredChecks.length) {
  fail('R5L preflight mismatch.')
}
for (const key of ['releaseCandidate', 'promotionEligible']) if (preflight.execution[key] !== false) fail(`R5L preflight must not overstate ${key}.`)
for (const key of ['disposableManagementEvidenceImported', 'managementRollbackProven', 'knowledgeIndexRecoveryProven']) if (preflight.execution[key] !== true) fail(`R5L imported execution gate must pass: ${key}.`)
if (bundle.environment?.productName !== 'Microsoft Windows Server 2025 Datacenter' || evidence.status !== 'passed' || evidence.sourceUserContentIncluded !== false) fail('R5L generic hosted evidence boundary drift.')
if (evidence.checks.length !== policy.requiredChecks.length) fail('R5L imported management check count mismatch.')
for (const checkId of policy.requiredChecks) if (!evidence.checks.some(check => check.id === checkId && check.status === 'passed')) fail(`R5L imported management check missing: ${checkId}`)
if (evidence.preflight?.valid !== true || evidence.preflight?.requiresLibraryMapping !== true || evidence.indexBeforeRollback?.state !== 'ready' || evidence.indexAfterRestore?.state !== 'ready') fail('R5L backup, mapping, or index recovery evidence drift.')
for (const token of [
  "__TAURI_INTERNALS__?.invoke",
  "export_management_backup",
  "preflight_management_backup_import",
  "restore_management_backup",
  "delete_knowledge_index",
  "rebuild_knowledge_index",
  "post-restore application reload",
  "R5J_TEXT_SAVED",
  "R5J_JSON_SAVED",
  "sourceUserContentIncluded: false",
]) {
  if (!capture.includes(token)) fail(`R5L capture token missing: ${token}`)
}
for (const checkId of policy.requiredChecks) {
  if (!capture.includes(`id: '${checkId}'`)) fail(`R5L capture check missing: ${checkId}`)
}
for (const token of [
  'ManagementRollbackSmokeScript',
  'config.json',
  'R5L Disposable Vault',
  'LONGEDIT_R5L_MODE',
  'LONGEDIT_R5L_BACKUP',
  'post-restore-uninstall-retains-management-data',
]) {
  if (!lifecycle.includes(token) && !sandbox.includes(token)) fail(`R5L lifecycle integration missing: ${token}`)
}
for (const source of [exporter, importer]) {
  if (!source.includes('management-backup-index-evidence.json')) {
    fail('R5L evidence handoff member is missing.')
  }
}
for (const token of ['R5L', 'releaseCandidate=false', 'R5M', 'Windows Server 2025']) {
  if (!auditDoc.includes(token)) fail(`R5L audit document token missing: ${token}`)
}
for (const token of ['U2O update', policy.currentStatus, 'R5N']) {
  if (!statusDoc.includes(token)) fail(`R5L status document token missing: ${token}`)
}
for (const command of ['audit:r5l-management-rollback-preflight', 'check:r5l-management-rollback-closure']) {
  if (!packageJson.scripts?.[command]) fail(`R5L npm command missing: ${command}`)
}

console.log('R5L management backup, rollback restore, and index rebuild passed on generic hosted Windows; client and signed lanes remain pending.')
