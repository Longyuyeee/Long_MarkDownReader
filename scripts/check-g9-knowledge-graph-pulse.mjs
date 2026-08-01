import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/g9-knowledge-graph-pulse-policy.json')
const packageJson = json('package.json')
const graph = read('src-tauri/src/commands/graph.rs')
const lib = read('src-tauri/src/lib.rs')
const workspace = read('src/views/WorkspaceHome.vue')
const audit = read('docs/G9_Knowledge_Network_Pulse_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G9' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G9 policy identity drift')
if (policy.status !== 'knowledge-network-pulse-implemented-real-library-acceptance-next' || policy.nextStage !== 'G10-real-library-graph-acceptance') failures.push('G9 stage boundary drift')
if (policy.metrics.length !== 7 || new Set(policy.metrics).size !== 7 || policy.productIntegration.boundedTopTopicCount !== 6) failures.push('G9 metric contract drift')
for (const key of ['workspaceHomeVisible', 'centeredGraphNavigation', 'emptyStateGuidance', 'relationTypesDeterministic']) if (policy.productIntegration[key] !== true) failures.push(`G9 product integration must pass: ${key}`)
if (policy.qualityGate.realUserLibraryEvidenceComplete !== false || policy.qualityGate.signedWindowsClientEvidenceComplete !== false) failures.push('G9 must not overstate external evidence')

for (const [source, token, message] of [
  [graph, 'pub struct KnowledgeGraphPulse', 'typed pulse missing'],
  [graph, 'knowledge_graph_pulse_exposes_coverage_relation_types_and_top_nodes', 'pulse regression missing'],
  [lib, 'get_knowledge_graph_pulse', 'pulse command registration missing'],
  [workspace, '知识网络脉搏', 'workspace pulse UI missing'],
  [workspace, 'graphPulse.coveragePercent', 'coverage UI missing'],
  [workspace, "query: { root: nodeId }", 'centered topic navigation missing'],
]) requireText(source, token, message)
for (const token of ['G9', 'releaseCandidate=false', 'G10', '真实资料库']) requireText(audit, token, `G9 audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g9-knowledge-graph-pulse'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g9-knowledge-graph-pulse')) failures.push('G9 checker must be reachable through the graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('G9 knowledge network pulse passed: workspace coverage, relation types, bounded top topics, and centered navigation are implemented without claiming real-library or signed-client evidence.')
