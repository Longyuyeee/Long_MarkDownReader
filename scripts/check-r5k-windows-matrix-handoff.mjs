import fs from 'node:fs'

const read = filePath => fs.readFileSync(filePath, 'utf8')
const json = filePath => JSON.parse(read(filePath))
const fail = message => {
  console.error(message)
  process.exit(1)
}

const packageJson = json('package.json')
const policy = json('shared/r5k-windows-matrix-handoff-policy.json')
const r5jPolicy = json('shared/r5j-installed-artifact-smoke-policy.json')
const preflight = json(policy.handoff.preflight)
const importedRoot = policy.handoff.importTarget
const bundle = json(`${importedRoot}/r5k-bundle-manifest.json`)
const importedLifecycle = json(`${importedRoot}/lifecycle-result.json`)
const installedSmoke = json(`${importedRoot}/installed-artifact-smoke.json`)
const managementEvidence = json(`${importedRoot}/management-backup-index-evidence.json`)
const lifecycle = read('scripts/run-r5i-isolated-install-lifecycle.ps1')
const sandbox = read('scripts/new-r5i-windows-sandbox-config.ps1')
const exporter = read('scripts/export-r5k-windows-evidence-bundle.ps1')
const importer = read('scripts/import-r5k-windows-evidence-bundle.ps1')
const rejections = read('scripts/test-r5k-windows-evidence-bundle-rejections.ps1')
const preflightScript = read('scripts/audit-r5k-windows-matrix-preflight.mjs')
const auditDoc = read('docs/U2O_Hosted_Unsigned_Lifecycle_Closure_Audit_2026-08-01.md')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5K') fail('R5K policy identity mismatch.')
if (policy.appVersion !== packageJson.version) fail('R5K appVersion must match package.json.')
if (policy.releaseCandidate !== false) fail('R5K must keep releaseCandidate=false.')
if (policy.currentStatus !== 'generic-hosted-windows-evidence-imported-client-matrix-pending') fail('R5K current status mismatch.')
if (r5jPolicy.nextStage !== 'R5K') fail('R5J must hand off to R5K.')
if (policy.nextStage !== 'R5M') fail('R5K must hand off to R5M after generic hosted evidence closes R5L runtime coverage.')

for (const key of [
  'sourceCommitBound',
  'currentInstallerDigestBound',
  'exactArchiveMemberSetRequired',
  'memberDigestsRequired',
  'flatSafeMemberNamesRequired',
  'noEvidenceOverwrite',
]) {
  if (policy.handoff[key] !== true) fail(`R5K handoff must require ${key}.`)
}
if (policy.handoff.malformedBundleRejectionCount !== 4 || policy.handoff.realEvidenceImported !== true) {
  fail('R5K handoff completion boundary mismatch.')
}
for (const key of ['machineNameAllowed', 'userNameAllowed', 'credentialsAllowed', 'sourceUserContentAllowed']) {
  if (policy.privacyBoundary[key] !== false) fail(`R5K privacy boundary must reject ${key}.`)
}
if (
  policy.releaseGate.matrixRunnerImplemented !== true ||
  policy.releaseGate.evidenceExporterImplemented !== true ||
  policy.releaseGate.evidenceImporterImplemented !== true ||
  policy.releaseGate.rejectionMatrixPassed !== true
) {
  fail('R5K implementation gates must pass.')
}
for (const key of [
  'windows10EvidenceComplete',
  'windows11EvidenceComplete',
  'signedArtifactRuntimeProven',
  'currentPromotionEligible',
]) {
  if (policy.releaseGate[key] !== false) fail(`R5K must not overstate ${key}.`)
}
if (policy.releaseGate.disposableWindowsEvidenceImported !== true || policy.releaseGate.rollbackEvidenceComplete !== true) fail('R5K hosted evidence completion gates must pass.')
if (!fs.existsSync(importedRoot)) fail('R5K imported hosted evidence is missing.')

if (preflight.schemaVersion !== 1 || preflight.stage !== 'R5K') fail('R5K preflight identity mismatch.')
if (preflight.appVersion !== packageJson.version) fail('R5K preflight version mismatch.')
if (!/^[a-f0-9]{40}$/.test(preflight.sourceCommit) || !/^[a-f0-9]{64}$/.test(preflight.currentInstallerSha256)) {
  fail('R5K preflight source/artifact binding mismatch.')
}
for (const [key, expected] of Object.entries({
  lifecycleMatrixRunnerReady: true,
  downgradeRejectionReady: true,
  fileAssociationRecoveryReady: true,
  rollbackToPreviousReady: true,
  evidenceBundleExporterReady: true,
  evidenceBundleImporterReady: true,
  malformedBundleRejectionMatrixPassed: true,
})) {
  if (preflight.implementation[key] !== expected) fail(`R5K preflight implementation mismatch: ${key}`)
}
if (preflight.currentHost.isolatedRunnerAvailable !== false || preflight.currentHost.hostInstallerMutationAllowed !== false) {
  fail('R5K host safety boundary mismatch.')
}
for (const key of ['windows10MatrixComplete', 'windows11MatrixComplete', 'downgradeRejectionProven', 'releaseCandidate', 'promotionEligible', 'sourceUserContentIncluded']) if (preflight.execution[key] !== false) fail(`R5K preflight must not overstate ${key}.`)
for (const key of ['disposableWindowsBundleImported', 'fileAssociationRecoveryProven', 'rollbackProven']) if (preflight.execution[key] !== true) fail(`R5K imported execution gate must pass: ${key}.`)

if (bundle.sourceCommit !== preflight.sourceCommit || bundle.currentInstallerSha256 !== preflight.currentInstallerSha256) fail('R5K imported bundle binding drift.')
if (bundle.environment?.productName !== 'Microsoft Windows Server 2025 Datacenter' || bundle.releaseCandidate !== false || bundle.promotionEligible !== false || bundle.signedArtifactRuntimeProven !== false || bundle.sourceUserContentIncluded !== false) fail('R5K hosted environment or release boundary drift.')
if (importedLifecycle.status !== 'passed' || installedSmoke.status !== 'passed' || managementEvidence.status !== 'passed') fail('R5K imported runtime evidence must pass.')
for (const checkId of policy.requiredLifecycleChecks) if (!importedLifecycle.checks.some(check => check.id === checkId && check.status === 'passed')) fail(`R5K imported lifecycle result missing: ${checkId}`)
for (const checkId of ['installed-txt-read-edit-save-reopen', 'installed-json-read-edit-save-reopen']) {
  const result = installedSmoke.checks.find(check => check.id === checkId)
  if (result?.status !== 'passed' || result.visual?.markerHitTestVisible !== true || result.visual?.contrastRatio < 4.5) fail(`R5K installed visual evidence failed: ${checkId}`)
}

for (const checkId of policy.requiredLifecycleChecks) {
  if (!lifecycle.includes(`id = "${checkId}"`)) fail(`R5K lifecycle check source missing: ${checkId}`)
}
for (const token of [
  'LongEdit.Markdown',
  'legacy-downgrade-detected-and-current-restored',
  'rollback-previous-install',
  'rollback-first-launch',
  'export-r5k-windows-evidence-bundle.ps1',
  'ExpectedSourceCommit',
]) {
  if (!lifecycle.includes(token) && !sandbox.includes(token)) fail(`R5K lifecycle token missing: ${token}`)
}
for (const token of [
  'disposable_windows_evidence_bundle',
  'machineClassFingerprintSha256',
  'machineNameIncluded = $false',
  'userNameIncluded = $false',
  'CreateNew',
  'Get-FileHash',
]) {
  if (!exporter.includes(token)) fail(`R5K exporter token missing: ${token}`)
}
for (const token of [
  'flat safe member names',
  'contains duplicate members',
  'must contain exactly',
  'different source commit',
  'different current installer',
  'member digest drifted',
  'approvedSourceCommit',
  'windows-server-x64',
  'ValidationOnly',
  'installed-txt-save-reopen.jpg',
  'rollback-cleanup-retains-user-data',
  'Refusing to overwrite existing R5K imported evidence',
]) {
  if (!importer.includes(token)) fail(`R5K importer token missing: ${token}`)
}
for (const token of [
  'path_traversal',
  'extra_member',
  'source_commit_drift',
  'member_digest_drift',
  'promoted evidence',
]) {
  if (!rejections.includes(token)) fail(`R5K rejection token missing: ${token}`)
}
for (const token of [
  'lifecycleMatrixRunnerReady: true',
  'malformedBundleRejectionMatrixPassed: true',
  'disposableWindowsBundleImported: hostedEvidencePassed',
  "Microsoft Windows Server 2025 Datacenter",
]) {
  if (!preflightScript.includes(token)) fail(`R5K preflight script token missing: ${token}`)
}
for (const token of [
  'R5K',
  'generic-hosted-windows-evidence-imported-client-matrix-pending',
  'releaseCandidate=false',
  'R5M',
]) {
  if (!auditDoc.includes(token)) fail(`R5K audit doc token missing: ${token}`)
}
for (const token of [
  'U2O update',
  'generic-hosted-windows-evidence-imported-client-matrix-pending',
  '30664431101',
  'R5N',
]) {
  if (!statusDoc.includes(token)) fail(`R5K status doc token missing: ${token}`)
}
for (const command of [
  'audit:r5k-windows-matrix-preflight',
  'export:r5k-windows-evidence',
  'import:r5k-windows-evidence',
  'check:r5k-windows-evidence-rejections',
  'check:r5k-windows-matrix-handoff',
]) {
  if (!packageJson.scripts?.[command]) fail(`R5K npm command missing: ${command}`)
}

console.log('R5K hosted Windows lifecycle evidence passed with rollback and visual proof; Windows 10/11 signed client lanes remain fail-closed.')
