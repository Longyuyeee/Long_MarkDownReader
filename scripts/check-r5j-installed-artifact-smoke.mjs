import fs from 'node:fs'

const read = filePath => fs.readFileSync(filePath, 'utf8')
const json = filePath => JSON.parse(read(filePath))
const fail = message => {
  console.error(message)
  process.exit(1)
}

const packageJson = json('package.json')
const policy = json('shared/r5j-installed-artifact-smoke-policy.json')
const r5iPolicy = json('shared/r5i-isolated-install-lifecycle-policy.json')
const preflight = json(policy.evidence.preflight)
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const lifecycle = read('scripts/run-r5i-isolated-install-lifecycle.ps1')
const sandbox = read('scripts/new-r5i-windows-sandbox-config.ps1')
const preflightScript = read('scripts/audit-r5j-installed-artifact-smoke-preflight.mjs')
const auditDoc = read('docs/R5J_Installed_Artifact_Workspace_Smoke_Audit_2026-07-31.md')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5J') fail('R5J policy identity mismatch.')
if (policy.appVersion !== packageJson.version) fail('R5J appVersion must match package.json.')
if (policy.releaseCandidate !== false) fail('R5J must keep releaseCandidate=false.')
if (policy.currentStatus !== 'installed-smoke-runner-ready-disposable-execution-pending') fail('R5J current status mismatch.')
if (r5iPolicy.nextStage !== 'R5J') fail('R5I must hand off to R5J.')
if (policy.nextStage !== 'R5K') fail('R5J must hand off to R5K.')

for (const key of [
  'sourceRepositoryMappedReadOnly',
  'evidenceDirectoryOnlyWritableMapping',
  'fixedSyntheticFixturesRequired',
  'currentInstallerHashMustMatchR5H',
]) {
  if (policy.safetyBoundary[key] !== true) fail(`R5J safety boundary must require ${key}.`)
}
if (policy.safetyBoundary.hostInstallerMutationAllowed !== false || policy.safetyBoundary.sourceUserContentAllowed !== false) {
  fail('R5J must reject host mutation and user content.')
}
if (
  policy.releaseGate.installedSmokeSourceImplemented !== true ||
  policy.releaseGate.nodeRuntimeMappingImplemented !== true ||
  policy.releaseGate.lifecycleRunnerIntegrated !== true
) {
  fail('R5J implementation gates must pass.')
}
for (const key of [
  'installedArtifactSmokeExecuted',
  'representativeRoutesVerified',
  'txtJsonSaveReopenVerified',
  'windows10EvidenceComplete',
  'windows11EvidenceComplete',
  'signedArtifactRuntimeProven',
  'currentPromotionEligible',
]) {
  if (policy.releaseGate[key] !== false) fail(`R5J must not overstate ${key}.`)
}
if (policy.evidence.preflightComplete !== true || policy.evidence.guestEvidenceComplete !== false) {
  fail('R5J evidence completion boundary mismatch.')
}
if (fs.existsSync(policy.evidence.installedArtifactSmoke)) {
  fail('R5J installed-artifact evidence must remain absent until a real disposable Windows run.')
}

if (preflight.schemaVersion !== 1 || preflight.stage !== 'R5J') fail('R5J preflight identity mismatch.')
if (preflight.appVersion !== packageJson.version || preflight.sourceReady !== true) fail('R5J preflight source/version mismatch.')
if (preflight.currentInstallerMatchCount !== 1 || preflight.previousInstallerMatchCount !== 1) fail('R5J installer preflight mismatch.')
if (preflight.currentHost.isolatedRunnerAvailable !== false || preflight.currentHost.hostInstallerMutationAllowed !== false) {
  fail('R5J host boundary mismatch.')
}
for (const [key, expected] of Object.entries({
  installedArtifactSmokeExecuted: false,
  lifecycleResultImported: false,
  representativeRoutesVerified: false,
  txtJsonSaveReopenVerified: false,
  routePerformanceExported: false,
  screenshotsCaptured: false,
  releaseCandidate: false,
  promotionEligible: false,
  sourceUserContentIncluded: false,
})) {
  if (preflight.execution[key] !== expected) fail(`R5J preflight execution mismatch: ${key}`)
}

for (const token of [
  'installed-txt-read-edit-save-reopen',
  'installed-json-read-edit-save-reopen',
  'installed-representative-right-side-routes',
  '__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__',
  'sourceUserContentIncluded: false',
  'installed-txt-save-reopen.jpg',
  'installed-json-save-reopen.jpg',
]) {
  if (!capture.includes(token)) fail(`R5J capture token missing: ${token}`)
}
for (const route of policy.representativeRoutes) {
  if (!capture.includes(`'${route}'`)) fail(`R5J representative route missing: ${route}`)
}
for (const token of [
  'LONGEDIT_R5J_LIBRARY',
  'LONGEDIT_R5J_EXECUTABLE',
  'capture-r5j-installed-artifact-smoke.mjs',
  'installed-artifact-route-and-io-smoke',
  'Wait-ForPort -Port 9343',
]) {
  if (!lifecycle.includes(token) && !sandbox.includes(token)) fail(`R5J lifecycle integration token missing: ${token}`)
}
for (const token of [
  'LongEditR5INode',
  '<Networking>Disable</Networking>',
  '<ReadOnly>true</ReadOnly>',
  '<ReadOnly>false</ReadOnly>',
  '-NodeExecutable',
  '-InstalledSmokeScript',
]) {
  if (!sandbox.includes(token)) fail(`R5J Sandbox mapping token missing: ${token}`)
}
for (const token of [
  'sourceReady: true',
  'installedArtifactSmokeExecuted: false',
  'expectedGuestEvidenceFiles',
]) {
  if (!preflightScript.includes(token)) fail(`R5J preflight script token missing: ${token}`)
}
for (const token of [
  'R5J',
  'installed-smoke-runner-ready-disposable-execution-pending',
  'releaseCandidate=false',
  'R5K',
]) {
  if (!auditDoc.includes(token)) fail(`R5J audit doc token missing: ${token}`)
}
for (const token of [
  'R5J update',
  'r5j-installed-artifact-smoke-policy.json',
  'installed-smoke-runner-ready-disposable-execution-pending',
  'R5K',
]) {
  if (!statusDoc.includes(token)) fail(`R5J status doc token missing: ${token}`)
}
if (!packageJson.scripts?.['audit:r5j-installed-artifact-preflight']) fail('R5J preflight script is missing from package.json.')
if (!packageJson.scripts?.['check:r5j-installed-artifact-smoke']) fail('R5J checker script is missing from package.json.')

console.log('R5J installed-artifact smoke contract passed: integrated workspace I/O and route runner is ready without overstating disposable Windows evidence.')
