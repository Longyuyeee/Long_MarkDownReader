import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const policy = json('shared/g15c-installed-guidance-outcome-policy.json')
const packageJson = json('package.json')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const workflow = read('.github/workflows/u2-unsigned-lifecycle.yml')
const audit = read('docs/G15C_Installed_Knowledge_Guidance_Outcome_Runner_Audit_2026-08-01.md')
const receipt = json('docs/evidence/g15c-installed-guidance-outcome/acceptance-receipt.json')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G15C' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G15C policy identity drift')
if (policy.status !== 'hosted-installed-guidance-outcome-passed-real-user-follow-up-next' || policy.nextStage !== 'G15-consented-real-library-baseline-remediation-follow-up') failures.push('G15C stage boundary drift')
if (!/^[a-f0-9]{40}$/.test(policy.productSourceCommit) || policy.hostedRunId !== 30693694231) failures.push('G15C execution identity drift')
if (policy.requiredChecks.length !== 7 || policy.expectedEvidenceFiles.length !== 4) failures.push('G15C installed evidence matrix drift')
if (policy.attemptHistory.length !== 3 || policy.attemptHistory[0].runId !== 30692454820 || policy.attemptHistory[0].status !== 'failed-before-g15c' || policy.attemptHistory[0].productBuildComplete !== true || policy.attemptHistory[0].g15cExecuted !== false || policy.attemptHistory[1].runId !== 30693531173 || policy.attemptHistory[1].status !== 'functional-passed-visual-recapture-required' || policy.attemptHistory[1].g15cExecuted !== true || policy.attemptHistory[2].runId !== 30693694231 || policy.attemptHistory[2].status !== 'accepted') failures.push('G15C attempt audit drift')
for (const key of ['fixedSyntheticLibraryOnly', 'aggregateEvidenceOnly', 'sameApplicationWindowRequired']) if (policy.safetyBoundary[key] !== true) failures.push(`G15C safety guarantee drift: ${key}`)
for (const key of ['sourceUserContentAllowed', 'automaticUploadAllowed', 'hostInstallerMutationAllowed']) if (policy.safetyBoundary[key] !== false) failures.push(`G15C prohibited boundary drift: ${key}`)
for (const key of ['hostedInstalledExecutionComplete', 'screenshotReviewComplete']) if (policy.qualityGate[key] !== true) failures.push(`G15C accepted gate drift: ${key}`)
for (const key of ['realUserComparisonComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G15C external evidence must remain pending: ${key}`)
if (policy.evidence.acceptanceReceipt !== 'docs/evidence/g15c-installed-guidance-outcome/acceptance-receipt.json') failures.push('G15C acceptance receipt path drift')

if (receipt.schemaVersion !== 1 || receipt.stage !== 'G15C' || receipt.status !== 'accepted' || receipt.hostedRunId !== policy.hostedRunId || receipt.productSourceCommit !== policy.productSourceCommit) failures.push('G15C receipt identity drift')
if (receipt.installedSmoke.passed !== 9 || receipt.installedSmoke.total !== 9 || receipt.lifecycle.passed !== 18 || receipt.lifecycle.total !== 18) failures.push('G15C accepted check counts drift')
if (receipt.observationSurface.viewportVisible !== true || receipt.observationSurface.openedInCurrentWindow !== true || receipt.comparison.outcome !== 'improved' || receipt.comparison.changes.objectCount !== 1 || receipt.comparison.changes.relationCount !== 1 || receipt.comparison.changes.connectedObjectCount !== 1) failures.push('G15C accepted outcome drift')
for (const key of ['sourceUserContentIncluded', 'objectIdentifiersIncluded', 'fileNamesIncluded', 'absolutePathsIncluded', 'signedArtifactRuntimeProven', 'realUserComparisonComplete', 'releaseCandidate']) if (receipt[key] !== false) failures.push(`G15C receipt boundary drift: ${key}`)
if (receipt.visualReview.status !== 'accepted' || !/^[a-f0-9]{64}$/.test(receipt.visualReview.screenshotSha256)) failures.push('G15C visual acceptance drift')

for (const token of ['installed workspace initialization before route testing', "navigate('#/workspace', '.workspace-home', 'installed workspace initialization')", '对比改善结果', "scrollIntoView({ block: 'center' })", 'observationSurface.viewportVisible', 'outside the screenshot viewport', 'data-testid="knowledge-observation-export"', 'data-testid="knowledge-observation-compare"', "invokeTauri('export_knowledge_graph_observation'", "invokeTauri('get_knowledge_graph_observation_comparison'", "invokeTauri('export_knowledge_graph_observation_comparison'", "comparisonReceipt.outcome !== 'improved'", 'Installed knowledge comparison leaked synthetic identifier', "stage: 'G15C'", "id: 'installed-consented-knowledge-guidance-outcome'", ...policy.expectedEvidenceFiles]) requireText(capture, token, `G15C installed runner marker missing: ${token}`)
for (const token of ['workflow_dispatch:', 'product_ref:', 'capture-r5j-installed-artifact-smoke.mjs', 'actions/upload-artifact']) requireText(workflow, token, `G15C hosted workflow marker missing: ${token}`)
for (const token of ['G15C', 'releaseCandidate=false', '合成资料库', '安装态', '真实资料库']) requireText(audit, token, `G15C audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g15c-installed-guidance-outcome'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g15c-installed-guidance-outcome')) failures.push('G15C checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('G15C installed guidance outcome passed: hosted installed functional evidence and visible Settings controls are accepted; real-user and signed-client evidence remain pending.')
