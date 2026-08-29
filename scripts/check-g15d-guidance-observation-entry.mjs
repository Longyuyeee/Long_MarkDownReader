import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const policy = json('shared/g15d-guidance-observation-entry-policy.json')
const packageJson = json('package.json')
const home = read('src/views/WorkspaceHome.vue')
const graph = read('src/components/GraphView.vue')
const settings = read('src/views/SettingsView.vue')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const workflow = read('.github/workflows/u2-unsigned-lifecycle.yml')
const audit = read('docs/G15D_Knowledge_Guidance_Observation_Entry_Audit_2026-08-01.md')
const receipt = json('docs/evidence/g15d-guidance-observation-entry/acceptance-receipt.json')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G15D' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G15D policy identity drift')
if (policy.status !== 'hosted-installed-observation-entry-passed-real-user-execution-next' || policy.nextStage !== 'G15-consented-real-library-baseline-remediation-follow-up') failures.push('G15D stage boundary drift')
if (!/^[a-f0-9]{40}$/.test(policy.productSourceCommit) || policy.hostedRunId !== 30695157895 || policy.expectedEvidenceFiles.length !== 3 || policy.acceptanceReceipt !== 'docs/evidence/g15d-guidance-observation-entry/acceptance-receipt.json') failures.push('G15D accepted installed evidence identity drift')
if (policy.entries.workspaceHome !== 'removed-to-avoid-duplicate-governance' || policy.entries.graphRemediation !== 'settings-knowledge-observation-focus') failures.push('G15D entry matrix drift')
for (const key of ['sameApplicationWindow', 'targetScrollIntoView', 'targetHighlight']) if (policy.destination[key] !== true) failures.push(`G15D navigation guarantee drift: ${key}`)
for (const [key, value] of Object.entries(policy.consentBoundary)) if (value !== false) failures.push(`G15D consent boundary must remain false: ${key}`)
for (const key of ['graphFollowUpEntryImplemented', 'settingsFocusImplemented', 'frontendProductionBuildComplete', 'hostedFunctionalNavigationComplete', 'installedNavigationComplete', 'installedVisualReviewComplete']) if (policy.qualityGate[key] !== true) failures.push(`G15D implemented gate drift: ${key}`)
if (policy.qualityGate.workspaceEntryImplemented !== false) failures.push('G15D workspace duplicate entry must remain removed')
for (const key of ['realUserComparisonComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G15D external gate must remain false: ${key}`)
if (receipt.schemaVersion !== 1 || receipt.stage !== 'G15D' || receipt.status !== 'accepted' || receipt.hostedRunId !== policy.hostedRunId || receipt.productSourceCommit !== policy.productSourceCommit) failures.push('G15D acceptance receipt identity drift')
if (receipt.installedSmoke?.status !== 'passed' || receipt.installedSmoke?.passed !== 10 || receipt.installedSmoke?.total !== 10 || receipt.lifecycle?.status !== 'passed' || receipt.lifecycle?.passed !== 18 || receipt.lifecycle?.total !== 18) failures.push('G15D installed acceptance counts drift')
for (const entry of [receipt.navigation?.workspaceObservationEntry, receipt.navigation?.graphOutcomeEntry]) {
  if (entry?.route !== '#/settings?focus=knowledge-observation' || entry?.targetVisible !== true || entry?.targetFocused !== true || entry?.openedInCurrentWindow !== true) failures.push('G15D accepted navigation receipt drift')
}
if (receipt.navigation?.exportTriggered !== false || receipt.navigation?.visualSurfaceSettled !== true || receipt.visualReview?.status !== 'accepted' || receipt.visualReview?.focusedObservationRowVisible !== true || receipt.visualReview?.labelsReadable !== true || receipt.visualReview?.existingSettingsStyleAligned !== true || receipt.visualReview?.separateWindowObserved !== false) failures.push('G15D visual acceptance receipt drift')
for (const hash of [receipt.installerSha256, receipt.visualReview?.workspaceScreenshotSha256, receipt.visualReview?.graphScreenshotSha256]) if (!/^[a-f0-9]{64}$/.test(hash || '')) failures.push('G15D acceptance hash drift')
if (receipt.sourceUserContentIncluded !== false || receipt.realUserLibraryExecutionComplete !== false || receipt.signedWindowsClientEvidenceComplete !== false || receipt.releaseCandidate !== false || receipt.promotionEligible !== false) failures.push('G15D acceptance boundary drift')

if (home.includes('data-testid="knowledge-observation-entry"')) failures.push('G15D Workspace Home must not duplicate the graph observation entry')
for (const token of ['data-testid="knowledge-outcome-entry"', '复查改善', 'openKnowledgeOutcome', "name: 'Settings', query: { focus: 'knowledge-observation' }"]) requireText(graph, token, `G15D graph follow-up entry missing: ${token}`)
for (const token of ['ref="knowledgeObservationRow"', "route.query.focus === 'knowledge-observation'", "scrollIntoView({ behavior: 'smooth', block: 'center' })", 'is-route-focused']) requireText(settings, token, `G15D focused Settings destination missing: ${token}`)
for (const token of ['waitForStableVisibleSurface', "document.querySelector('.page-loader')", 'visualSurfaceSettled: true', 'installed graph governance knowledge network pulse', 'graph knowledge outcome entry', 'graphOutcomeNavigation', 'observation session graph governance handoff', "exportTriggered: false", "id: 'installed-knowledge-observation-entry-navigation'", 'installed-graph-outcome-entry.jpg', 'installed-knowledge-observation-entry-evidence.json']) requireText(capture, token, `G15D installed navigation runner missing: ${token}`)
for (const stale of ['workspace knowledge observation entry', 'workspaceObservationNavigation', "document.querySelector('[data-testid=\"knowledge-observation-entry\"]')"]) if (capture.includes(stale)) failures.push(`G15D installed runner retains removed Workspace entry: ${stale}`)
for (const token of ['workflow_dispatch:', 'product_ref:', 'capture-r5j-installed-artifact-smoke.mjs', 'actions/upload-artifact']) requireText(workflow, token, `G15D hosted workflow marker missing: ${token}`)
for (const token of ['G15D', 'releaseCandidate=false', '记录治理基线', '复查改善', '不会自动']) requireText(audit, token, `G15D audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g15d-guidance-observation-entry'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g15d-guidance-observation-entry')) failures.push('G15D checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('G15D guidance observation entry passed: the graph governance follow-up reaches a readable, focused Settings observation row in the current window without restoring the removed Workspace duplicate; historical evidence remains immutable.')
