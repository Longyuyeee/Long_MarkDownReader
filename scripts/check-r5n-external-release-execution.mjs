import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const fail = message => {
  console.error(message)
  process.exit(1)
}

const packageJson = json('package.json')
const policy = json('shared/r5n-external-release-execution-policy.json')
const r5mPolicy = json('shared/r5m-final-release-closure-policy.json')
const approvalContract = json('shared/r5m-manual-release-approval-contract.json')
const environment = json('docs/evidence/r5n-external-release/environment-audit.json')
const preflight = json('docs/evidence/r5n-release-promotion/preflight.json')
const baseImporter = read('scripts/import-r5k-windows-evidence-bundle.ps1')
const signedImporter = read('scripts/import-r5n-signed-windows-evidence.ps1')
const sandbox = read('scripts/new-r5i-windows-sandbox-config.ps1')
const signedCapture = read('scripts/capture-r5n-signed-installer-manifest.ps1')
const environmentAudit = read('scripts/audit-r5n-external-release-environment.ps1')
const promotionAudit = read('scripts/audit-r5n-release-promotion-readiness.ps1')
const approvalGenerator = read('scripts/new-r5n-manual-release-approval.ps1')
const rejections = read('scripts/test-r5n-release-closure-rejections.ps1')
const auditDoc = read('docs/R5N_External_Release_Execution_Handoff_Audit_2026-07-31.md')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5N' || policy.appVersion !== packageJson.version) {
  fail('R5N policy identity mismatch.')
}
if (r5mPolicy.nextStage !== 'R5N' || policy.releaseCandidate !== false ||
    policy.currentStatus !== 'external-release-handoff-ready-environment-and-evidence-blocked' ||
    policy.nextAction !== 'external-release-execution') {
  fail('R5N handoff or truth boundary mismatch.')
}
for (const [key, value] of Object.entries(policy.implementation)) {
  if (key === 'unsafeTransitionRejectionCount') {
    if (value !== 3) fail('R5N rejection count mismatch.')
  } else if (value !== true) {
    fail(`R5N implementation gate must pass: ${key}`)
  }
}
for (const [key, value] of Object.entries(policy.failClosedRules)) {
  if (value !== true) fail(`R5N fail-closed rule must pass: ${key}`)
}
for (const [key, value] of Object.entries(policy.releaseGate)) {
  if (value !== false) fail(`R5N current release gate must remain false: ${key}`)
}
if (environment.stage !== 'R5N' ||
    environment.currentStatus !== 'external-release-environment-blocked' ||
    environment.releaseCandidate !== false || environment.promotionEligible !== false ||
    environment.hostInstallerMutationAllowed !== false ||
    environment.environment.windowsSandboxAvailable !== false ||
    environment.environment.hyperVProvisioningCmdletAvailable !== false ||
    environment.environment.signToolAvailable !== false ||
    environment.environment.eligibleCurrentUserCodeSigningCertificateCount !== 0) {
  fail('R5N external environment evidence mismatch.')
}
for (const blocker of [
  'no-windows-sandbox-or-hyper-v-provisioning-command',
  'windows-sdk-signtool-unavailable',
  'no-current-user-code-signing-certificate-with-private-key',
  'windows-10-disposable-runner-not-provided',
  'windows-11-disposable-runner-not-provided',
]) {
  if (!environment.blockers.includes(blocker)) fail(`R5N environment blocker missing: ${blocker}`)
}
if (preflight.stage !== 'R5N' || preflight.releaseCandidate !== false ||
    preflight.promotionEligible !== false || preflight.automatedGatesPassed !== false ||
    preflight.signedManifestReady !== false || preflight.signedWindowsMatrixReady !== false ||
    preflight.manualApprovalRecorded !== false) {
  fail('R5N release promotion preflight mismatch.')
}
if (fs.existsSync('docs/evidence/r5n-signed-release/signed-installer-manifest.json') ||
    fs.existsSync(approvalContract.decisionFile) ||
    fs.existsSync('docs/evidence/r5k-windows-matrix/signed-windows-10-x64') ||
    fs.existsSync('docs/evidence/r5k-windows-matrix/signed-windows-11-x64')) {
  fail('R5N real signed evidence must remain absent until external execution succeeds.')
}
for (const token of [
  'signed-windows-10-x64',
  'signed-windows-11-x64',
  'ArtifactManifestPath',
  'signed release lane requires signed-artifact runtime evidence',
]) {
  if (!baseImporter.includes(token)) fail(`R5N base importer token missing: ${token}`)
}
for (const token of ['signed-$WindowsVersion', 'ArtifactManifestPath', 'ExpectedWindowsClass']) {
  if (!signedImporter.includes(token)) fail(`R5N signed importer token missing: ${token}`)
}
for (const token of ['Artifact manifest signing state must match', 'RequireSignedArtifact']) {
  if (!sandbox.includes(token)) fail(`R5N Sandbox manifest binding missing: ${token}`)
}
for (const token of [
  'ConfirmSignedReleaseArtifacts',
  'SignedArtifactDirectory',
  'r5n-signed',
  'Get-AuthenticodeSignature',
  'TimeStamperCertificate',
  'signerCertificateSha256',
  'timestampCertificateSha256',
  'Refusing to overwrite',
]) {
  if (!signedCapture.includes(token)) fail(`R5N signed capture token missing: ${token}`)
}
for (const token of ['PreviousInstallerDirectory', 'guestPreviousInstallerDirectory', 'guestInstallerDirectory']) {
  if (!sandbox.includes(token) && !read('scripts/run-r5i-isolated-install-lifecycle.ps1').includes(token)) {
    fail(`R5N split installer directory token missing: ${token}`)
  }
}
for (const token of ['signToolAvailable', 'eligibleCurrentUserCodeSigningCertificateCount', 'hostInstallerMutationAllowed = $false']) {
  if (!environmentAudit.includes(token)) fail(`R5N environment audit token missing: ${token}`)
}
for (const token of [
  'signedManifestReady',
  'signedWindowsMatrixReady',
  'automatedGatesPassed',
  'manualApprovalRecorded',
  'promotionEligible',
]) {
  if (!promotionAudit.includes(token)) fail(`R5N promotion audit token missing: ${token}`)
}
for (const token of ['ConfirmReleaseApproval', 'automatedGatesPassed', 'Refusing to overwrite', 'approverRole']) {
  if (!approvalGenerator.includes(token)) fail(`R5N approval generator token missing: ${token}`)
}
for (const token of [
  'unsigned artifacts unexpectedly',
  'unsigned manifest unexpectedly',
  'incomplete automated gates unexpectedly',
  'unsafe transitions rejected',
]) {
  if (!rejections.includes(token)) fail(`R5N rejection token missing: ${token}`)
}
for (const token of ['R5N', 'releaseCandidate=false', 'external-release-execution', 'Windows 10', 'Windows 11']) {
  if (!auditDoc.includes(token)) fail(`R5N audit document token missing: ${token}`)
}
for (const token of ['R5N update', policy.currentStatus, 'external-release-execution']) {
  if (!statusDoc.includes(token)) fail(`R5N status document token missing: ${token}`)
}
for (const command of [
  'audit:r5n-external-release-environment',
  'capture:r5n-signed-installer-manifest',
  'import:r5n-signed-windows-evidence',
  'audit:r5n-release-promotion-readiness',
  'approve:r5n-release',
  'check:r5n-release-closure-rejections',
  'check:r5n-external-release-execution',
]) {
  if (!packageJson.scripts?.[command]) fail(`R5N npm command missing: ${command}`)
}

console.log('R5N signed artifact handoff, separate signed Windows lanes, explicit approval, and fail-closed external release contract passed without claiming unavailable evidence.')
