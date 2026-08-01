import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const policy = json('shared/g15c-installed-guidance-outcome-policy.json')
const packageJson = json('package.json')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const workflow = read('.github/workflows/u2-unsigned-lifecycle.yml')
const audit = read('docs/G15C_Installed_Knowledge_Guidance_Outcome_Runner_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G15C' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G15C policy identity drift')
if (policy.status !== 'installed-guidance-outcome-runner-integrated-hosted-execution-next' || policy.nextStage !== 'G15C-hosted-installed-execution-and-evidence-review') failures.push('G15C stage boundary drift')
if (!/^[a-f0-9]{40}$/.test(policy.productSourceCommit) || policy.hostedRunId !== null) failures.push('G15C pending execution identity drift')
if (policy.requiredChecks.length !== 7 || policy.expectedEvidenceFiles.length !== 4) failures.push('G15C installed evidence matrix drift')
if (policy.attemptHistory.length !== 1 || policy.attemptHistory[0].runId !== 30692454820 || policy.attemptHistory[0].status !== 'failed-before-g15c' || policy.attemptHistory[0].productBuildComplete !== true || policy.attemptHistory[0].g15cExecuted !== false) failures.push('G15C failed-attempt audit drift')
for (const key of ['fixedSyntheticLibraryOnly', 'aggregateEvidenceOnly', 'sameApplicationWindowRequired']) if (policy.safetyBoundary[key] !== true) failures.push(`G15C safety guarantee drift: ${key}`)
for (const key of ['sourceUserContentAllowed', 'automaticUploadAllowed', 'hostInstallerMutationAllowed']) if (policy.safetyBoundary[key] !== false) failures.push(`G15C prohibited boundary drift: ${key}`)
for (const key of ['hostedInstalledExecutionComplete', 'screenshotReviewComplete', 'realUserComparisonComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G15C evidence must remain pending: ${key}`)

for (const token of ['installed workspace initialization before route testing', `location.hash.startsWith('#/workspace')`, 'data-testid="knowledge-observation-export"', 'data-testid="knowledge-observation-compare"', "invokeTauri('export_knowledge_graph_observation'", "invokeTauri('get_knowledge_graph_observation_comparison'", "invokeTauri('export_knowledge_graph_observation_comparison'", "comparisonReceipt.outcome !== 'improved'", 'Installed knowledge comparison leaked synthetic identifier', "stage: 'G15C'", "id: 'installed-consented-knowledge-guidance-outcome'", ...policy.expectedEvidenceFiles]) requireText(capture, token, `G15C installed runner marker missing: ${token}`)
for (const token of ['workflow_dispatch:', 'product_ref:', 'capture-r5j-installed-artifact-smoke.mjs', 'actions/upload-artifact']) requireText(workflow, token, `G15C hosted workflow marker missing: ${token}`)
for (const token of ['G15C', 'releaseCandidate=false', '合成资料库', '安装态', '真实资料库']) requireText(audit, token, `G15C audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g15c-installed-guidance-outcome'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g15c-installed-guidance-outcome')) failures.push('G15C checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('G15C installed guidance outcome runner passed: the disposable installed WebView2 lifecycle now exercises aggregate baseline, synthetic remediation, comparison, privacy scan, and settings visibility without claiming hosted or real-user evidence.')
