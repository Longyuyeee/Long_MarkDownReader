import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/g14-installed-knowledge-guidance-policy.json')
const packageJson = json('package.json')
const graphPanel = read('src/components/GraphHealthPanel.vue')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const workflow = read('.github/workflows/u2-unsigned-lifecycle.yml')
const audit = read('docs/G14_Installed_Actionable_Knowledge_Guidance_Audit_2026-08-01.md')
const receipt = json('docs/evidence/g14-installed-knowledge-guidance/acceptance-receipt.json')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G14' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G14 policy identity drift')
if (policy.status !== 'hosted-installed-actionable-guidance-passed-real-user-observation-next' || policy.nextStage !== 'G15-consented-real-library-guidance-observation') failures.push('G14 stage boundary drift')
if (policy.fixtureClassification !== 'fixed-synthetic-management-library' || policy.expectedGuidanceCode !== 'network-health-on-track') failures.push('G14 synthetic acceptance boundary drift')
if (policy.requiredChecks.length !== 2 || policy.requiredEvidenceFiles.length !== 3) failures.push('G14 check/evidence matrix drift')
if (policy.evidence.runnerIntegrated !== true || policy.evidence.hostedExecutionCompleteForCurrentProductCommit !== true || policy.evidence.screenshotsManuallyReviewed !== true || policy.evidence.sourceUserContentIncluded !== false || policy.evidence.signedWindowsClientEvidenceComplete !== false) failures.push('G14 evidence truth boundary drift')
if (policy.evidence.githubRunId !== 30690425501 || policy.evidence.productSourceCommit !== '068d3bd5d868a5f6e3d04a53935d8735f2208769' || policy.evidence.orchestrationCommit !== 'cc9c549fe90d678c9f38fa327b18f3b2bf22d091') failures.push('G14 hosted evidence binding drift')
if (receipt.schemaVersion !== 1 || receipt.stage !== 'G14' || receipt.status !== 'passed' || receipt.githubRunId !== policy.evidence.githubRunId || receipt.productSourceCommit !== policy.evidence.productSourceCommit || receipt.orchestrationCommit !== policy.evidence.orchestrationCommit) failures.push('G14 acceptance receipt identity drift')
if (receipt.sourceUserContentIncluded !== false || receipt.releaseCandidate !== false || receipt.signedArtifactRuntimeProven !== false || receipt.lifecycleChecksPassed !== 18 || receipt.installedSmokeChecksPassed !== 8) failures.push('G14 acceptance boundary/count drift')
if (receipt.knowledgePulse?.guidanceCode !== 'network-health-on-track' || receipt.knowledgePulse?.coveragePercent !== 100 || receipt.guidanceNavigation?.route !== '#/graph' || receipt.guidanceNavigation?.openedInCurrentWindow !== true) failures.push('G14 accepted guidance/navigation drift')
if (Object.values(receipt.visualReview || {}).some(value => value !== true)) failures.push('G14 visual review must remain fully accepted')
if (receipt.artifacts?.length !== policy.requiredEvidenceFiles.length) failures.push('G14 accepted artifact count drift')
for (const artifact of receipt.artifacts || []) if (!policy.requiredEvidenceFiles.includes(artifact.name) || artifact.bytes <= 0 || !/^[a-f0-9]{64}$/.test(artifact.sha256)) failures.push(`G14 artifact receipt invalid: ${artifact.name}`)

for (const token of ['data-testid="knowledge-network-guidance"', 'data-guidance-code', "'network-health-on-track'"]) requireText(graphPanel, token, `G14 graph governance selector missing: ${token}`)
for (const token of ['installed actionable knowledge guidance', "knowledgePulse.guidance.code !== 'network-health-on-track'", "title.includes('状态良好')", 'actionable guidance graph route mount', "route.startsWith('#/graph')", 'openedInCurrentWindow', 'installed-knowledge-guidance-graph.jpg', "stage: 'G14'"]) requireText(capture, token, `G14 installed capture marker missing: ${token}`)
for (const token of ['workflow_dispatch:', '-InstalledSmokeScript', 'actions/upload-artifact@v4']) requireText(workflow, token, `G14 hosted workflow marker missing: ${token}`)
for (const token of ['G14', 'releaseCandidate=false', '合成资料库', '同一窗口', '真实用户', '30690425501', '100%']) requireText(audit, token, `G14 audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g14-installed-knowledge-guidance'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g14-installed-knowledge-guidance')) failures.push('G14 checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('G14 installed actionable guidance passed: hosted installed WebView2 evidence shows healthy guidance and current-window graph navigation without claiming real-user or signed-client evidence.')
