import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/g11-installed-knowledge-pulse-policy.json')
const packageJson = json('package.json')
const home = read('src/views/WorkspaceHome.vue')
const graph = read('src/components/GraphView.vue')
const lifecycle = read('scripts/run-r5i-isolated-install-lifecycle.ps1')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const audit = read('docs/G11_Installed_Knowledge_Pulse_Runner_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G11' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G11 policy identity drift')
if (policy.status !== 'installed-knowledge-pulse-runner-integrated-hosted-execution-next' || policy.nextStage !== 'G11-hosted-installed-artifact-execution') failures.push('G11 stage boundary drift')
if (policy.fixtureClassification !== 'fixed-synthetic-management-library' || policy.evidence.runnerIntegrated !== true || policy.evidence.hostedExecutionCompleteForCurrentCommit !== false) failures.push('G11 evidence boundary drift')
if (policy.requiredChecks.length !== 2 || policy.evidenceFiles.length !== 3) failures.push('G11 check/evidence matrix drift')
for (const token of ['data-testid="knowledge-network-pulse"', 'data-testid="knowledge-network-coverage"', 'data-testid="knowledge-network-topic"', ':data-node-id="node.id"']) requireText(home, token, `G11 workspace selector missing: ${token}`)
requireText(graph, 'data-testid="graph-selected-node"', 'G11 selected graph node selector missing')
for (const token of ['r5j-north-star.md', 'r5j-plan.md', 'r5j-network.canvas', 'depends-on: [[r5j-north-star]]', '"relationType":"supports"']) requireText(lifecycle, token, `G11 fixture marker missing: ${token}`)
for (const token of [...policy.requiredChecks, ...policy.evidenceFiles, 'knowledgePulse.coveragePercent < 60', 'knowledgePulse.connectedObjectCount <= knowledgePulse.isolatedObjectCount', "centeredNavigation.nodeId !== selectedTopic.nodeId", "!centeredNavigation.route.includes('root=')"]) requireText(capture, token, `G11 capture marker missing: ${token}`)
for (const token of ['G11', 'releaseCandidate=false', '合成', '托管执行']) requireText(audit, token, `G11 audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g11-installed-knowledge-pulse'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g11-installed-knowledge-pulse')) failures.push('G11 checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('G11 installed knowledge pulse runner passed: fixed synthetic relations, stable UI selectors, quantitative pulse checks, screenshots, and centered navigation are integrated; hosted execution remains pending.')
