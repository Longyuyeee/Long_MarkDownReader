import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const policy = json('shared/g16-knowledge-isolation-action-queue-policy.json')
const packageJson = json('package.json')
const graph = read('src-tauri/src/commands/graph.rs')
const workspace = read('src/views/WorkspaceHome.vue')
const audit = read('docs/G16_Knowledge_Isolation_Action_Queue_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G16' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G16 policy identity drift')
if (policy.status !== 'knowledge-isolation-action-queue-source-validated-installed-acceptance-next' || policy.nextStage !== 'G16-installed-isolated-object-navigation-acceptance') failures.push('G16 stage boundary drift')
if (policy.productBoundary.boundedItemCount !== 6) failures.push('G16 bounded queue drift')
for (const key of ['deterministicOrdering', 'workspaceHomeVisible', 'centeredGraphNavigation', 'sameWindowNavigation']) if (policy.productBoundary[key] !== true) failures.push(`G16 product boundary drift: ${key}`)
for (const key of ['automaticRelationCreationAllowed', 'automaticFileMutationAllowed', 'newContentCollectionAllowed']) if (policy.productBoundary[key] !== false) failures.push(`G16 mutation/privacy boundary drift: ${key}`)
for (const key of ['rustRegressionImplemented', 'responsiveWorkspaceLayoutImplemented', 'frontendProductionBuildComplete', 'graphProductContractComplete']) if (policy.qualityGate[key] !== true) failures.push(`G16 implementation gate drift: ${key}`)
for (const key of ['installedNavigationComplete', 'realUserLibraryEvidenceComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G16 pending gate must remain false: ${key}`)

for (const token of ['pub isolated_nodes: Vec<KnowledgeGraphPulseNode>', 'isolated_nodes.sort_by', 'isolated_nodes.truncate(6)', 'assert_eq!(pulse.isolated_nodes[0].id, "isolated")', 'knowledge_graph_pulse_bounds_and_orders_isolated_action_queue']) requireText(graph, token, `G16 backend queue missing: ${token}`)
for (const token of ['graphPulse.isolatedNodes.length', 'data-testid="knowledge-isolation-queue"', 'data-testid="knowledge-isolation-item"', '优先连接', '@click="openPulseNode(node.id)"', '.pulse-isolation', '.canvas-list,.pulse-isolation>div:last-child']) requireText(workspace, token, `G16 Workspace action queue missing: ${token}`)
for (const forbidden of ['create_graph_relation', 'update_graph_relation', 'write_text_document']) if (workspace.includes(`knowledge-isolation-item") @click="${forbidden}`)) failures.push(`G16 queue must not mutate content: ${forbidden}`)
for (const token of ['G16', '孤立对象', '不会自动', 'releaseCandidate=false']) requireText(audit, token, `G16 audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g16-knowledge-isolation-action-queue'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g16-knowledge-isolation-action-queue')) failures.push('G16 checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('G16 knowledge isolation action queue passed: the bounded deterministic Workspace queue, production build, Rust regression, and G9-G16 product contracts are complete without creating relations or modifying files; installed acceptance remains pending.')
