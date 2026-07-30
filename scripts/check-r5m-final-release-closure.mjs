import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const fail = message => {
  console.error(message)
  process.exit(1)
}

const packageJson = json('package.json')
const policy = json('shared/r5m-final-release-closure-policy.json')
const r5lPolicy = json('shared/r5l-management-rollback-closure-policy.json')
const preflight = json('docs/evidence/r5m-final-release/preflight.json')
const approvalContract = json('shared/r5m-manual-release-approval-contract.json')
const baseImporter = read('scripts/import-r5k-windows-evidence-bundle.ps1')
const laneImporter = read('scripts/import-r5m-windows-matrix-evidence.ps1')
const laneRejection = read('scripts/test-r5m-windows-lane-rejection.ps1')
const lifecycle = read('scripts/run-r5i-isolated-install-lifecycle.ps1')
const sandbox = read('scripts/new-r5i-windows-sandbox-config.ps1')
const smoke = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const exporter = read('scripts/export-r5k-windows-evidence-bundle.ps1')
const readinessAudit = read('scripts/audit-r5m-final-release-readiness.ps1')
const auditDoc = read('docs/R5M_Final_Release_Closure_Audit_2026-07-31.md')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5M' || policy.appVersion !== packageJson.version) {
  fail('R5M policy identity mismatch.')
}
if (policy.releaseCandidate !== false ||
    policy.currentStatus !== 'dual-lane-import-and-final-audit-ready-external-evidence-pending' ||
    policy.nextStage !== 'R5N' || r5lPolicy.nextStage !== 'R5M') {
  fail('R5M handoff or truth boundary mismatch.')
}
if (policy.requiredWindowsLanes.join('|') !== 'windows-10-x64|windows-11-x64') {
  fail('R5M required Windows lanes mismatch.')
}
if (approvalContract.stage !== 'R5N' ||
    approvalContract.decisionFile !== 'docs/evidence/r5m-final-release/manual-approval.json' ||
    approvalContract.requiredDecision !== 'approved' ||
    approvalContract.requirements.automaticApprovalForbidden !== true) {
  fail('R5M manual approval contract mismatch.')
}
for (const [key, value] of Object.entries(policy.implementation)) {
  if (value !== true) fail(`R5M implementation gate must pass: ${key}`)
}
for (const [key, value] of Object.entries(policy.promotionRules)) {
  if (value !== true) fail(`R5M promotion rule must fail closed: ${key}`)
}
for (const key of [
  'windows10EvidenceImported',
  'windows11EvidenceImported',
  'authenticodeSignedAndTimestamped',
  'signedArtifactWindows10RuntimeProven',
  'signedArtifactWindows11RuntimeProven',
  'manualReleaseApprovalRecorded',
  'currentPromotionEligible',
]) {
  if (policy.releaseGate[key] !== false) fail(`R5M must not overstate ${key}.`)
}
if (preflight.schemaVersion !== 1 || preflight.stage !== 'R5M' ||
    preflight.releaseCandidate !== false || preflight.promotionEligible !== false ||
    preflight.matrix.bothLanesImported !== false ||
    preflight.matrix.signedRuntimeMatrixComplete !== false ||
    preflight.artifacts.currentHashesMatch !== true ||
    preflight.artifacts.allSignedAndTimestamped !== false ||
    preflight.manualApprovalRecorded !== false) {
  fail('R5M current readiness evidence mismatch.')
}
for (const blocker of [
  'windows-10-11-evidence-lanes-incomplete',
  'authenticode-signing-or-timestamp-incomplete',
  'signed-artifact-runtime-matrix-incomplete',
  'manual-release-approval-not-recorded',
]) {
  if (!preflight.blockers.includes(blocker)) fail(`R5M blocker missing: ${blocker}`)
}
for (const token of [
  'TargetName',
  'ExpectedWindowsClass',
  'productName',
  'windows-10-x64',
  'windows-11-x64',
  'Windows evidence class mismatch',
  'wrong matrix lane',
]) {
  if (!baseImporter.includes(token)) fail(`R5M base importer token missing: ${token}`)
}
for (const token of ['WindowsVersion', 'ExpectedWindowsClass', 'TargetName']) {
  if (!laneImporter.includes(token)) fail(`R5M lane importer token missing: ${token}`)
}
for (const token of ['22621', 'Windows evidence class mismatch', 'wrong-lane evidence']) {
  if (!laneRejection.includes(token)) fail(`R5M lane rejection token missing: ${token}`)
}
for (const token of [
  'RequireSignedArtifact',
  'Get-AuthenticodeSignature',
  'timestamped',
  'signerCertificateSha256',
  'timestampCertificateSha256',
]) {
  if (!lifecycle.includes(token) && !sandbox.includes(token)) fail(`R5M signed runtime token missing: ${token}`)
}
if (!smoke.includes('LONGEDIT_R5J_SIGNED_RUNTIME') ||
    !exporter.includes('[bool]$smoke.signedArtifactRuntimeProven')) {
  fail('R5M signed runtime evidence propagation is incomplete.')
}
for (const token of [
  'bothLanesImported',
  'allArtifactsSignedAndTimestamped',
  'signedRuntimeMatrixComplete',
  'manual-release-approval-not-recorded',
  'manual-approval.json',
  'windowsLaneSourceCommits',
  'approverRole',
]) {
  if (!readinessAudit.includes(token)) fail(`R5M readiness audit token missing: ${token}`)
}
for (const token of ['R5M', 'releaseCandidate=false', 'R5N', 'Windows 10', 'Windows 11']) {
  if (!auditDoc.includes(token)) fail(`R5M audit document token missing: ${token}`)
}
for (const token of ['R5M update', policy.currentStatus, 'R5N']) {
  if (!statusDoc.includes(token)) fail(`R5M status document token missing: ${token}`)
}
for (const command of [
  'import:r5m-windows-matrix-evidence',
  'audit:r5m-final-release-readiness',
  'check:r5m-windows-lane-rejection',
  'check:r5m-final-release-closure',
]) {
  if (!packageJson.scripts?.[command]) fail(`R5M npm command missing: ${command}`)
}

console.log('R5M dual Windows lanes, signed-runtime mode, and fail-closed final release audit passed without promoting unsigned or unexecuted artifacts.')
