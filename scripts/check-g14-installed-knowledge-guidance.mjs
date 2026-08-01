import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/g14-installed-knowledge-guidance-policy.json')
const packageJson = json('package.json')
const home = read('src/views/WorkspaceHome.vue')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const workflow = read('.github/workflows/u2-unsigned-lifecycle.yml')
const audit = read('docs/G14_Installed_Actionable_Knowledge_Guidance_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G14' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G14 policy identity drift')
if (policy.status !== 'installed-actionable-guidance-runner-integrated-hosted-execution-next' || policy.nextStage !== 'G14-hosted-installed-guidance-execution') failures.push('G14 stage boundary drift')
if (policy.fixtureClassification !== 'fixed-synthetic-management-library' || policy.expectedGuidanceCode !== 'network-health-on-track') failures.push('G14 synthetic acceptance boundary drift')
if (policy.requiredChecks.length !== 2 || policy.requiredEvidenceFiles.length !== 3) failures.push('G14 check/evidence matrix drift')
if (policy.evidence.runnerIntegrated !== true || policy.evidence.hostedExecutionCompleteForCurrentProductCommit !== false || policy.evidence.screenshotsManuallyReviewed !== false || policy.evidence.sourceUserContentIncluded !== false || policy.evidence.signedWindowsClientEvidenceComplete !== false) failures.push('G14 evidence truth boundary drift')

for (const token of ['data-testid="knowledge-network-guidance"', 'data-guidance-code', "'network-health-on-track'"]) requireText(home, token, `G14 workspace selector missing: ${token}`)
for (const token of ['installed actionable knowledge guidance', "knowledgePulse.guidance.code !== 'network-health-on-track'", "title.includes('状态良好')", 'actionable guidance graph route mount', "route.startsWith('#/graph')", 'openedInCurrentWindow', 'installed-knowledge-guidance-graph.jpg', "stage: 'G14'"]) requireText(capture, token, `G14 installed capture marker missing: ${token}`)
for (const token of ['workflow_dispatch:', '-InstalledSmokeScript', 'actions/upload-artifact@v4']) requireText(workflow, token, `G14 hosted workflow marker missing: ${token}`)
for (const token of ['G14', 'releaseCandidate=false', '合成资料库', '同一窗口', '真实用户']) requireText(audit, token, `G14 audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g14-installed-knowledge-guidance'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g14-installed-knowledge-guidance')) failures.push('G14 checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('G14 installed actionable guidance runner passed: the disposable installed client must render healthy guidance and navigate in the current window; hosted execution remains pending.')
