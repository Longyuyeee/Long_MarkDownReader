import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const policy = json('shared/g15e-consented-real-library-session-policy.json')
const packageJson = json('package.json')
const settings = read('src/views/SettingsView.vue')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const audit = read('docs/G15E_Consented_Real_Library_Session_Audit_2026-08-01.md')
const receipt = json('docs/evidence/g15e-consented-real-library-session/acceptance-receipt.json')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G15E' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G15E policy identity drift')
if (policy.status !== 'hosted-installed-session-guidance-passed-consented-real-user-execution-next' || policy.nextStage !== 'G15-consented-real-library-baseline-remediation-follow-up') failures.push('G15E stage boundary drift')
if (policy.productSourceCommit !== 'eafd75828a697470c4974e1039da038ad8220f23' || policy.hostedRunId !== 30696762556 || policy.expectedEvidenceFiles.length !== 3 || policy.acceptanceReceipt !== 'docs/evidence/g15e-consented-real-library-session/acceptance-receipt.json') failures.push('G15E accepted installed evidence identity drift')
if (policy.steps.length !== 4 || policy.sessionState.storage !== 'sessionStorage' || JSON.stringify(policy.sessionState.storedFields) !== JSON.stringify(['schemaVersion', 'phase'])) failures.push('G15E bounded session state drift')
for (const [key, value] of Object.entries(policy.sessionState)) if (key.endsWith('Included') && value !== false) failures.push(`G15E session privacy drift: ${key}`)
for (const key of ['automaticBaselineExportAllowed', 'automaticComparisonExportAllowed', 'automaticRemediationAllowed', 'automaticUploadAllowed']) if (policy.consentBoundary[key] !== false) failures.push(`G15E automatic action boundary drift: ${key}`)
for (const key of ['userChoosesLocalDestination', 'previewBeforeExport', 'explicitConfirmationRequired']) if (policy.consentBoundary[key] !== true) failures.push(`G15E consent guarantee drift: ${key}`)
for (const key of ['guidedSessionImplemented', 'progressResetImplemented', 'existingBaselineHandoffImplemented', 'responsiveSettingsStyleImplemented', 'frontendProductionBuildComplete', 'installedSessionComplete']) if (policy.qualityGate[key] !== true) failures.push(`G15E implementation gate drift: ${key}`)
for (const key of ['realUserSessionComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G15E pending gate must remain false: ${key}`)
if (receipt.schemaVersion !== 1 || receipt.stage !== 'G15E' || receipt.status !== 'accepted' || receipt.hostedRunId !== policy.hostedRunId || receipt.productSourceCommit !== policy.productSourceCommit) failures.push('G15E acceptance receipt identity drift')
if (receipt.installedSmoke?.status !== 'passed' || receipt.installedSmoke?.passed !== 11 || receipt.installedSmoke?.total !== 11 || receipt.lifecycle?.status !== 'passed' || receipt.lifecycle?.passed !== 18 || receipt.lifecycle?.total !== 18) failures.push('G15E installed acceptance counts drift')
if (JSON.stringify(receipt.session?.storedKeys) !== JSON.stringify(['phase', 'schemaVersion']) || receipt.session?.phase !== 3 || receipt.session?.storedPhase !== 3 || receipt.session?.comparisonUnlocked !== true || receipt.session?.openedInCurrentWindow !== true || receipt.session?.exportTriggered !== false || receipt.session?.automaticRemediationTriggered !== false) failures.push('G15E accepted session evidence drift')
for (const key of ['initialStepHighlighted', 'remediationStepCompleted', 'repeatedAcknowledgementDisabled', 'comparisonStepHighlighted', 'labelsReadable', 'existingSettingsStyleAligned']) if (receipt.visualReview?.[key] !== true) failures.push(`G15E visual acceptance drift: ${key}`)
if (receipt.visualReview?.status !== 'accepted' || receipt.visualReview?.separateWindowObserved !== false) failures.push('G15E visual review boundary drift')
for (const hash of [receipt.installerSha256, receipt.visualReview?.startScreenshotSha256, receipt.visualReview?.readyScreenshotSha256]) if (!/^[a-f0-9]{64}$/.test(hash || '')) failures.push('G15E acceptance hash drift')
if (receipt.sourceUserContentIncluded !== false || receipt.realUserSessionComplete !== false || receipt.signedWindowsClientEvidenceComplete !== false || receipt.releaseCandidate !== false || receipt.promotionEligible !== false) failures.push('G15E acceptance boundary drift')

for (const token of ['data-testid="knowledge-observation-session"', '关系整理效果对比', 'knowledge-session-save-baseline', 'knowledge-session-existing-baseline', 'knowledge-session-open-guidance', 'knowledge-session-remediation-complete', 'knowledge-session-compare', 'knowledge-observation-session-reset']) requireText(settings, token, `G15E guided UI missing: ${token}`)
for (const token of ['complete: observationSessionPhase >= 3', ':disabled="observationSessionPhase !== 2"', 'active: observationSessionPhase === 3, complete: observationSessionPhase === 4']) requireText(settings, token, `G15E phase presentation drift: ${token}`)
for (const token of ["const OBSERVATION_SESSION_KEY = 'longedit:knowledge-observation-session:v1'", "JSON.stringify({ schemaVersion: 1, phase })", 'advanceObservationSession(2)', 'advanceObservationSession(3)', 'advanceObservationSession(4)', "router.push({ name: 'Graph', query: { focus: 'overview' } })", '前往图谱建议']) requireText(settings, token, `G15E bounded progress flow missing: ${token}`)
if (settings.includes("router.push({ name: 'WorkspaceHome' })")) failures.push('G15E guidance must not route to Workspace Home after M2A2 removed detailed governance suggestions')
for (const forbidden of ['libraryPath, phase', 'libraryName, phase', 'baselinePath, phase', 'targetPath, phase']) if (settings.includes(`JSON.stringify({ ${forbidden}`)) failures.push(`G15E session state must not persist sensitive context: ${forbidden}`)
for (const token of ['waitForCdpTarget', 'after ${attempts} attempts', 'installed consented observation session', 'existing baseline session handoff', 'observation session resumed in Settings', 'installed comparison action unlocked', "automaticRemediationTriggered: false", "id: 'installed-consented-real-library-session-guidance'", ...policy.expectedEvidenceFiles]) requireText(capture, token, `G15E installed session runner missing: ${token}`)
for (const token of ['G15E', '真实资料库', '不会自动', 'releaseCandidate=false']) requireText(audit, token, `G15E audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g15e-consented-real-library-session'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g15e-consented-real-library-session')) failures.push('G15E checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('G15E consented real-library session passed: installed guidance and visual state are accepted with phase-only storage and no automated export, remediation, or upload; real-user execution remains pending.')
