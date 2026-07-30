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
const capture = read('scripts/capture-r5l-management-rollback-smoke.mjs')
const lifecycle = read('scripts/run-r5i-isolated-install-lifecycle.ps1')
const sandbox = read('scripts/new-r5i-windows-sandbox-config.ps1')
const exporter = read('scripts/export-r5k-windows-evidence-bundle.ps1')
const importer = read('scripts/import-r5k-windows-evidence-bundle.ps1')
const auditDoc = read('docs/R5L_Management_Backup_Index_Rollback_Audit_2026-07-31.md')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5L' || policy.appVersion !== packageJson.version) {
  fail('R5L policy identity mismatch.')
}
if (policy.currentStatus !== 'management-rollback-runner-ready-disposable-execution-pending' ||
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
  'managementRollbackProven',
  'knowledgeIndexRecoveryProven',
  'signedArtifactRuntimeProven',
  'currentPromotionEligible',
]) {
  if (policy.releaseGate[key] !== false) fail(`R5L must not overstate ${key}.`)
}
if (preflight.stage !== 'R5L' || preflight.appVersion !== packageJson.version ||
    preflight.currentStatus !== policy.currentStatus ||
    preflight.currentHost.hostInstallerMutationAllowed !== false ||
    preflight.evidenceContract.managementBackupZipExported !== false ||
    preflight.evidenceContract.requiredCheckCount !== policy.requiredChecks.length) {
  fail('R5L preflight mismatch.')
}
for (const key of ['managementRollbackProven', 'knowledgeIndexRecoveryProven', 'releaseCandidate', 'promotionEligible']) {
  if (preflight.execution[key] !== false) fail(`R5L preflight must not overstate ${key}.`)
}
for (const token of [
  "__TAURI_INTERNALS__?.invoke",
  "export_management_backup",
  "preflight_management_backup_import",
  "restore_management_backup",
  "delete_knowledge_index",
  "rebuild_knowledge_index",
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
for (const token of ['R5L', 'releaseCandidate=false', 'R5M', 'config.json']) {
  if (!auditDoc.includes(token)) fail(`R5L audit document token missing: ${token}`)
}
for (const token of ['R5L update', policy.currentStatus, 'R5M']) {
  if (!statusDoc.includes(token)) fail(`R5L status document token missing: ${token}`)
}
for (const command of ['audit:r5l-management-rollback-preflight', 'check:r5l-management-rollback-closure']) {
  if (!packageJson.scripts?.[command]) fail(`R5L npm command missing: ${command}`)
}

console.log('R5L management backup, rollback restore, index rebuild, and privacy handoff contract passed without claiming disposable execution.')
