import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/g11-installed-knowledge-pulse-policy.json')
const packageJson = json('package.json')
const graphPanel = read('src/components/GraphHealthPanel.vue')
const graph = read('src/components/GraphView.vue')
const lifecycle = read('scripts/run-r5i-isolated-install-lifecycle.ps1')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const audit = read('docs/G11_Installed_Knowledge_Pulse_Runner_Audit_2026-08-01.md')
const receipt = json('docs/evidence/g11-installed-knowledge-pulse/acceptance-receipt.json')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G11' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G11 policy identity drift')
if (policy.status !== 'hosted-installed-knowledge-pulse-passed-real-user-observation-next' || policy.nextStage !== 'G12-consented-real-library-observation-design') failures.push('G11 stage boundary drift')
if (policy.fixtureClassification !== 'fixed-synthetic-management-library' || policy.evidence.runnerIntegrated !== true || policy.evidence.hostedExecutionCompleteForCurrentCommit !== true || policy.evidence.screenshotsManuallyReviewed !== true) failures.push('G11 evidence boundary drift')
if (policy.requiredChecks.length !== 2 || policy.evidenceFiles.length !== 3) failures.push('G11 check/evidence matrix drift')
if (receipt.schemaVersion !== 1 || receipt.stage !== 'G11' || receipt.status !== 'passed' || receipt.githubRunId !== policy.evidence.githubRunId || receipt.productSourceCommit !== policy.evidence.productSourceCommit) failures.push('G11 acceptance receipt identity drift')
if (receipt.sourceUserContentIncluded !== false || receipt.releaseCandidate !== false || receipt.visualReview?.pulseVisible !== true || receipt.visualReview?.centeredGraphVisible !== true || receipt.visualReview?.loadingOverlayAbsent !== true) failures.push('G11 acceptance receipt boundary/visual review drift')
if (receipt.knowledgePulse.objectCount !== 5 || receipt.knowledgePulse.relationCount !== 6 || receipt.knowledgePulse.coveragePercent !== 100 || receipt.knowledgePulse.connectedObjectCount !== 5 || receipt.knowledgePulse.isolatedObjectCount !== 0 || receipt.centeredNavigationIdentityMatched !== true) failures.push('G11 accepted pulse result drift')
for (const artifact of receipt.artifacts) if (!/^[a-f0-9]{64}$/.test(artifact.sha256) || artifact.bytes <= 0) failures.push(`G11 artifact receipt invalid: ${artifact.name}`)
for (const token of ['data-testid="knowledge-network-pulse"', 'data-testid="knowledge-network-coverage"', 'data-testid="knowledge-network-topic"', ':data-node-id="node.id"']) requireText(graphPanel, token, `G11 graph governance selector missing: ${token}`)
requireText(graph, 'data-testid="graph-selected-node"', 'G11 selected graph node selector missing')
for (const token of ['r5j-north-star.md', 'r5j-plan.md', 'r5j-network.canvas', 'depends-on: [[r5j-north-star]]', '"relationType":"supports"']) requireText(lifecycle, token, `G11 fixture marker missing: ${token}`)
for (const token of [...policy.requiredChecks, ...policy.evidenceFiles, 'knowledgePulse.coveragePercent < 60', 'knowledgePulse.connectedObjectCount <= knowledgePulse.isolatedObjectCount', "centeredNavigation.nodeId !== selectedTopic.nodeId", "!centeredNavigation.route.includes('root=')"]) requireText(capture, token, `G11 capture marker missing: ${token}`)
for (const token of ["document.querySelector('.crash-fallback')", 'navigation timed out', 'completed without its expected surface', 'knowledge graph route transition', '2000']) requireText(capture, token, `G11 navigation diagnostic marker missing: ${token}`)
for (const token of ['G11', 'releaseCandidate=false', '合成', '30689117409', '100%', 'G12']) requireText(audit, token, `G11 audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g11-installed-knowledge-pulse'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g11-installed-knowledge-pulse')) failures.push('G11 checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('G11 installed knowledge pulse passed: hosted installed WebView2 evidence shows 5/5 connected objects, 6 relations, 100% coverage, and visually accepted centered navigation without claiming real-user or signed-client evidence.')
