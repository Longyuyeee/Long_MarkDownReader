import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const policy = json('shared/g15e-consented-real-library-session-policy.json')
const packageJson = json('package.json')
const settings = read('src/views/SettingsView.vue')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const audit = read('docs/G15E_Consented_Real_Library_Session_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G15E' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G15E policy identity drift')
if (policy.status !== 'consented-real-library-session-runner-integrated-hosted-execution-next' || policy.nextStage !== 'G15E-hosted-installed-session-guidance-acceptance') failures.push('G15E stage boundary drift')
if (policy.productSourceCommit !== '07edb2e47e227fefd240ac6f9e6a2dd33ad33187' || policy.hostedRunId !== null || policy.expectedEvidenceFiles.length !== 3) failures.push('G15E pending installed evidence identity drift')
if (policy.steps.length !== 4 || policy.sessionState.storage !== 'sessionStorage' || JSON.stringify(policy.sessionState.storedFields) !== JSON.stringify(['schemaVersion', 'phase'])) failures.push('G15E bounded session state drift')
for (const [key, value] of Object.entries(policy.sessionState)) if (key.endsWith('Included') && value !== false) failures.push(`G15E session privacy drift: ${key}`)
for (const key of ['automaticBaselineExportAllowed', 'automaticComparisonExportAllowed', 'automaticRemediationAllowed', 'automaticUploadAllowed']) if (policy.consentBoundary[key] !== false) failures.push(`G15E automatic action boundary drift: ${key}`)
for (const key of ['userChoosesLocalDestination', 'previewBeforeExport', 'explicitConfirmationRequired']) if (policy.consentBoundary[key] !== true) failures.push(`G15E consent guarantee drift: ${key}`)
for (const key of ['guidedSessionImplemented', 'progressResetImplemented', 'existingBaselineHandoffImplemented', 'responsiveSettingsStyleImplemented', 'frontendProductionBuildComplete']) if (policy.qualityGate[key] !== true) failures.push(`G15E implementation gate drift: ${key}`)
for (const key of ['installedSessionComplete', 'realUserSessionComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G15E pending gate must remain false: ${key}`)

for (const token of ['data-testid="knowledge-observation-session"', '真实资料库改善观察', 'knowledge-session-save-baseline', 'knowledge-session-existing-baseline', 'knowledge-session-open-guidance', 'knowledge-session-remediation-complete', 'knowledge-session-compare', 'knowledge-observation-session-reset']) requireText(settings, token, `G15E guided UI missing: ${token}`)
for (const token of ["const OBSERVATION_SESSION_KEY = 'longedit:knowledge-observation-session:v1'", "JSON.stringify({ schemaVersion: 1, phase })", 'advanceObservationSession(2)', 'advanceObservationSession(3)', 'advanceObservationSession(4)', "router.push({ name: 'WorkspaceHome' })"]) requireText(settings, token, `G15E bounded progress flow missing: ${token}`)
for (const forbidden of ['libraryPath, phase', 'libraryName, phase', 'baselinePath, phase', 'targetPath, phase']) if (settings.includes(`JSON.stringify({ ${forbidden}`)) failures.push(`G15E session state must not persist sensitive context: ${forbidden}`)
for (const token of ['installed consented observation session', 'existing baseline session handoff', 'observation session resumed in Settings', 'installed comparison action unlocked', "automaticRemediationTriggered: false", "id: 'installed-consented-real-library-session-guidance'", ...policy.expectedEvidenceFiles]) requireText(capture, token, `G15E installed session runner missing: ${token}`)
for (const token of ['G15E', '真实资料库', '不会自动', 'releaseCandidate=false']) requireText(audit, token, `G15E audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g15e-consented-real-library-session'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g15e-consented-real-library-session')) failures.push('G15E checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('G15E consented real-library session passed: the four-step Settings workflow and installed runner preserve phase-only state without automating export, remediation, or upload; hosted execution remains pending.')
