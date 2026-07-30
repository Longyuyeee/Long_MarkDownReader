import fs from 'node:fs'

const read = filePath => fs.readFileSync(filePath, 'utf8')
const json = filePath => JSON.parse(read(filePath))
const fail = message => {
  console.error(message)
  process.exit(1)
}

const packageJson = json('package.json')
const policy = json('shared/r5g-desktop-artifact-smoke-policy.json')
const r5fPolicy = json('shared/r5f-safe-tauri-runtime-policy.json')
const manifest = json('docs/evidence/r5g-desktop-artifact-smoke/audit-manifest.json')
const mounts = json('docs/evidence/r5g-desktop-artifact-smoke/route-mount-evidence.json')
const performance = json('docs/evidence/r5g-desktop-artifact-smoke/route-performance-evidence.json')
const runner = read('scripts/run-r5g-desktop-artifact-smoke.ps1')
const capture = read('scripts/capture-r5g-desktop-artifact-smoke.mjs')
const auditDoc = read('docs/R5G_Desktop_Artifact_Smoke_Audit_2026-07-31.md')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5G') fail('R5G policy identity mismatch.')
if (policy.appVersion !== packageJson.version) fail('R5G appVersion must match package.json.')
if (policy.releaseCandidate !== false) fail('R5G must keep releaseCandidate=false.')
if (policy.currentStatus !== 'current-release-built-debug-desktop-io-smoke-passed-signed-artifact-pending') fail('R5G current status mismatch.')
if (r5fPolicy.nextStage !== 'R5G') fail('R5F must hand off to R5G.')
if (policy.nextStage !== 'R5H') fail('R5G must hand off to R5H.')
if (policy.artifacts.releaseExecutableBuilt !== true || policy.artifacts.debugExecutableRuntimeSmokeExecuted !== true) fail('R5G artifact coverage mismatch.')
if (policy.artifacts.releaseExecutableRuntimeSmokeExecuted !== false || policy.artifacts.signedInstallerRuntimeSmokeExecuted !== false) {
  fail('R5G must not overstate release or signed installer runtime evidence.')
}
if (policy.releaseGate.currentDesktopIoSmokePassed !== true || policy.releaseGate.currentReleaseBuildPassed !== true) fail('R5G local desktop gates must pass.')
if (policy.releaseGate.signedArtifactRuntimeProven !== false || policy.releaseGate.currentPromotionEligible !== false) fail('R5G must remain non-promotional.')

for (const token of [
  'cargo build --locked',
  'npm.cmd run tauri -- build --no-bundle',
  'LONGEDIT_E2E_LIBRARY',
  'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS',
  'capture-r5g-desktop-artifact-smoke.mjs',
]) {
  if (!runner.includes(token)) fail(`R5G runner token missing: ${token}`)
}
for (const token of [
  'txt-read-edit-save-reopen',
  'json-read-edit-save-reopen',
  '__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__',
  'signedArtifactRuntimeProven: false',
  "environment: 'Current Tauri Debug WebView2 via Chrome DevTools Protocol'",
]) {
  if (!capture.includes(token)) fail(`R5G capture token missing: ${token}`)
}

if (manifest.stage !== 'R5G' || manifest.appVersion !== packageJson.version) fail('R5G manifest identity mismatch.')
if (manifest.environment !== 'Current Tauri Debug WebView2 via Chrome DevTools Protocol') fail('R5G environment mismatch.')
if (manifest.releaseCandidate !== false || manifest.promotionEligible !== false || manifest.signedArtifactRuntimeProven !== false) {
  fail('R5G manifest must remain truthful and non-promotional.')
}
if (manifest.sourceUserContentIncluded !== false) fail('R5G evidence must not include user content.')
for (const id of [
  'current-release-executable-built',
  'current-debug-webview-bootstrap',
  'txt-read-edit-save-reopen',
  'json-read-edit-save-reopen',
  'representative-right-side-routes',
  'desktop-route-performance-export',
]) {
  if (!manifest.checks?.some(check => check.id === id && check.status === 'passed')) fail(`R5G check missing: ${id}`)
}
const debugArtifact = manifest.artifacts?.find(artifact => artifact.kind === 'debug-runtime-smoke')
const releaseArtifact = manifest.artifacts?.find(artifact => artifact.kind === 'release-no-bundle')
if (!debugArtifact?.runtimeSmokeExecuted || releaseArtifact?.runtimeSmokeExecuted !== false) fail('R5G artifact runtime truth boundary mismatch.')
for (const artifact of [debugArtifact, releaseArtifact]) {
  if (!/^[a-f0-9]{64}$/.test(artifact?.sha256 || '') || artifact.size < 1_000_000) fail('R5G artifact hash or size is invalid.')
}

for (const route of policy.representativeRoutes) {
  const row = mounts.routes?.find(item => item.route === route)
  if (!row || row.status !== 'passed' || row.crashFallbackVisible !== false || row.routeWrapperMounted !== true) {
    fail(`R5G route evidence missing: ${route}`)
  }
}
if (mounts.sourceUserContentIncluded !== false || performance.sourceUserContentIncluded !== false) fail('R5G source-content boundary mismatch.')
if (performance.routes?.length < policy.representativeRoutes.length || performance.measures?.length < policy.representativeRoutes.length) {
  fail('R5G desktop performance evidence is incomplete.')
}

for (const filePath of policy.requiredEvidenceFiles) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) fail(`R5G evidence file missing: ${filePath}`)
}
for (const imagePath of policy.requiredEvidenceFiles.filter(filePath => filePath.endsWith('.jpg'))) {
  const bytes = fs.readFileSync(imagePath)
  if (bytes.length < 10_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) fail(`R5G screenshot is invalid: ${imagePath}`)
}

for (const token of [
  'R5G',
  'current-release-built-debug-desktop-io-smoke-passed-signed-artifact-pending',
  'releaseCandidate=false',
  'R5H',
]) {
  if (!auditDoc.includes(token)) fail(`R5G audit doc token missing: ${token}`)
}
for (const token of [
  'R5G update',
  'r5g-desktop-artifact-smoke-policy.json',
  'current-release-built-debug-desktop-io-smoke-passed-signed-artifact-pending',
  'R5H',
]) {
  if (!statusDoc.includes(token)) fail(`R5G status doc token missing: ${token}`)
}
if (!packageJson.scripts?.['audit:r5g-desktop-artifact-smoke']) fail('R5G audit script is missing from package.json.')
if (!packageJson.scripts?.['check:r5g-desktop-artifact-smoke']) fail('R5G check script is missing from package.json.')

console.log('R5G desktop artifact smoke passed: current desktop I/O and route evidence are complete without overstating signed artifact readiness.')
