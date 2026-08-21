import fs from 'node:fs'

const read = filePath => fs.readFileSync(filePath, 'utf8')
const json = filePath => JSON.parse(read(filePath))
const fail = message => {
  console.error(message)
  process.exit(1)
}

const packageJson = json('package.json')
const policy = json('shared/r5i-isolated-install-lifecycle-policy.json')
const r5hPolicy = json('shared/r5h-current-installer-evidence-policy.json')
const environment = json(policy.evidence.environmentAudit)
const auditScript = read('scripts/audit-r5i-isolated-install-environment.ps1')
const runner = read('scripts/run-r5i-isolated-install-lifecycle.ps1')
const sandboxConfig = read('scripts/new-r5i-windows-sandbox-config.ps1')
const auditDoc = read('docs/R5I_Isolated_Windows_Install_Lifecycle_Audit_2026-07-31.md')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5I') fail('R5I policy identity mismatch.')
if (policy.appVersion !== packageJson.version) fail('R5I appVersion must match package.json.')
if (policy.releaseCandidate !== false) fail('R5I must keep releaseCandidate=false.')
if (policy.currentStatus !== 'isolated-lifecycle-runner-ready-host-execution-blocked') fail('R5I current status mismatch.')
if (r5hPolicy.nextStage !== 'R5I') fail('R5H must hand off to R5I.')
if (policy.nextStage !== 'R5J') fail('R5I must hand off to R5J.')

for (const key of [
  'disposableMachineConfirmationRequired',
  'explicitInstallerMutationSwitchRequired',
  'existingProductRegistrationMustBeAbsent',
  'currentInstallerHashMustMatchR5H',
]) {
  if (policy.safetyBoundary[key] !== true) fail(`R5I safety boundary must require ${key}.`)
}
for (const key of [
  'hostInstallerMutationAllowed',
  'existingInstallMayBeOverwritten',
  'sourceUserContentAllowed',
]) {
  if (policy.safetyBoundary[key] !== false) fail(`R5I safety boundary must reject ${key}.`)
}
if (
  policy.releaseGate.runnerImplemented !== true ||
  policy.releaseGate.currentAndPreviousInstallersAvailable !== false ||
  policy.releaseGate.hostPreflightComplete !== true
) {
  fail('R5I implementation/preflight gates must pass.')
}
for (const key of [
  'isolatedLifecycleSmokeExecuted',
  'windows10EvidenceComplete',
  'windows11EvidenceComplete',
  'signedArtifactRuntimeProven',
  'currentPromotionEligible',
]) {
  if (policy.releaseGate[key] !== false) fail(`R5I must not overstate ${key}.`)
}
if (policy.evidence.environmentAuditComplete !== true || policy.evidence.lifecycleResultComplete !== false) {
  fail('R5I evidence completion boundary mismatch.')
}

if (environment.schemaVersion !== 1 || environment.stage !== 'R5I') fail('R5I environment evidence identity mismatch.')
if (environment.appVersion !== packageJson.version) fail('R5I environment version mismatch.')
if (environment.environment.machineIdentityIncluded !== false) fail('R5I evidence must exclude machine identity.')
if (
  environment.artifactPreflight.currentNsisMatchCount !== 1 ||
  environment.artifactPreflight.previousNsisMatchCount !== 0
) {
  fail('R5I current/previous installer preflight mismatch.')
}
if (
  environment.hostSafety.existingProductRegistrationCount < 1 ||
  environment.hostSafety.hostInstallerMutationAllowed !== false ||
  environment.hostSafety.existingInstallMayBeOverwritten !== false
) {
  fail('R5I host safety evidence must preserve the existing installation.')
}
if (
  environment.execution.isolatedRunnerAvailable !== false ||
  environment.execution.lifecycleSmokeExecuted !== false ||
  environment.execution.currentStatus !== 'host-preflight-passed-isolated-runner-unavailable' ||
  environment.execution.releaseCandidate !== false ||
  environment.execution.promotionEligible !== false ||
  environment.execution.sourceUserContentIncluded !== false
) {
  fail('R5I blocked execution evidence mismatch.')
}
if (fs.existsSync(policy.evidence.lifecycleResult)) {
  fail('R5I lifecycle result must not exist until a real disposable Windows run completes.')
}

for (const token of [
  'hostInstallerMutationAllowed = $false',
  'existingInstallMayBeOverwritten = $false',
  'sourceUserContentIncluded = $false',
  'windowsSandboxExecutablePresent',
]) {
  if (!auditScript.includes(token)) fail(`R5I environment audit token missing: ${token}`)
}
for (const token of [
  '-not $ConfirmDisposableMachine',
  '-not $AllowInstallerMutation',
  'WDAGUtilityAccount',
  'LONGEDIT_R5I_DISPOSABLE',
  'Current installer SHA-256 does not match the approved R5H evidence.',
  'requires a disposable machine with no existing LongEdit product registration',
  'previous-version-fresh-install',
  'controlled-upgrade',
  'first-launch-after-upgrade',
  'silent-uninstall',
  'uninstall-retains-user-data',
]) {
  if (!runner.includes(token)) fail(`R5I lifecycle runner token missing: ${token}`)
}
for (const token of [
  'WindowsSandbox.exe',
  '<ReadOnly>true</ReadOnly>',
  '<ReadOnly>false</ReadOnly>',
  '-ConfirmDisposableMachine',
  '-AllowInstallerMutation',
  '-ExpectedCurrentSha256',
]) {
  if (!sandboxConfig.includes(token)) fail(`R5I Sandbox config token missing: ${token}`)
}
for (const token of [
  'R5I',
  'isolated-lifecycle-runner-ready-host-execution-blocked',
  'releaseCandidate=false',
  'R5J',
]) {
  if (!auditDoc.includes(token)) fail(`R5I audit doc token missing: ${token}`)
}
for (const token of [
  'R5I update',
  'r5i-isolated-install-lifecycle-policy.json',
  'isolated-lifecycle-runner-ready-host-execution-blocked',
  'R5J',
]) {
  if (!statusDoc.includes(token)) fail(`R5I status doc token missing: ${token}`)
}
if (!packageJson.scripts?.['audit:r5i-isolated-install-environment']) fail('R5I environment audit script is missing from package.json.')
if (!packageJson.scripts?.['check:r5i-isolated-install-lifecycle']) fail('R5I checker script is missing from package.json.')

console.log('R5I isolated lifecycle contract passed: disposable runner is ready while host installation mutation remains truthfully blocked.')
