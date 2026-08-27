import fs from 'node:fs/promises'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const policy = await readJson('shared/post-v115-m3a8-semantic-exploration-exit-policy.json')
const stageEvidence = [
  ['M3A-1', 'docs/evidence/post-v115-m3a1-semantics/desktop.json'],
  ['M3A-2', 'docs/evidence/post-v115-m3a2-neighbor-focus/desktop.json'],
  ['M3A-3', 'docs/evidence/post-v115-m3a3-shortest-path/desktop.json'],
  ['M3A-4', 'docs/evidence/post-v115-m3a4-relation-evidence/desktop.json'],
  ['M3A-5', 'docs/evidence/post-v115-m3a5-community/desktop.json'],
  ['M3A-6', 'docs/evidence/post-v115-m3a6-node-comparison/desktop.json'],
  ['M3A-7', 'docs/evidence/post-v115-m3a7-neighbor-pinning-history/desktop.json'],
]

requireFact(policy.stage === 'M3A-8' && policy.requiredStages.join(',') === stageEvidence.map(([stage]) => stage).join(','), 'M3A exit-stage chain drifted')
requireFact(policy.exclusiveExplorationScopes.join(',') === 'neighbor,path,community,comparison,history', 'M3A exclusive exploration scope contract drifted')
requireFact(policy.selectedNextStage.id === 'M3B-0', 'M3A exit must lead to an M3B visual baseline audit')
for (const [stage, file] of stageEvidence) {
  const evidence = await readJson(file)
  requireFact(evidence.stage === stage, `${stage} evidence identity drifted`)
  requireFact(evidence.actual?.runtimeErrors === 0 && evidence.actual?.sourceFilesUnchanged && evidence.actual?.returnedToLibrary, `${stage} desktop safety or return evidence failed`)
}

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['data-active-exploration-scopes', "activeCommunityId.value = ''", "neighborFocusRootId.value = ''", 'selectionHistoryOpen.value = false']) requireFact(graphView.includes(token), `M3A combined-scope guard missing: ${token}`)

let desktop = null
try { desktop = await readJson('docs/evidence/post-v115-m3a8-semantic-exploration-exit/desktop.json') } catch {}
if (desktop) {
  const actual = desktop.actual
  const flow = actual.combinedFlow
  requireFact(desktop.stage === 'M3A-8' && actual.runtimeErrors === 0, 'M3A-8 desktop identity or runtime errors drifted')
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, 'M3A-8 changed source files or lost the library return')
  requireFact(flow?.objectTypeCount === 11 && flow?.relationTypeCount === 6, 'M3A-8 semantic legend coverage drifted')
  requireFact(flow?.neighbor?.oneHop === '3 / 17 节点 3 连接' && flow?.neighbor?.threeHop === '8 / 17 节点 9 连接', 'M3A-8 neighbor expansion drifted')
  requireFact(flow?.path?.scope === 'path' && flow?.path?.edgeCount === 3 && flow?.path?.evidenceEdgeCount === 3, 'M3A-8 path or evidence flow drifted')
  requireFact(flow?.community?.scope === 'community' && flow?.community?.nodeCount === flow?.community?.expectedNodeCount, 'M3A-8 community flow drifted')
  requireFact(flow?.comparison?.scope === 'comparison' && flow?.comparison?.commonCount === 1, 'M3A-8 comparison flow drifted')
  requireFact(flow?.history?.scope === 'history' && flow?.history?.restoredSelectedCount === 1, 'M3A-8 selection-history restore drifted')
  requireFact(flow?.pinning?.railVisible && flow?.pinning?.nodeCount === 6 && flow?.pinning?.edgeCount === 7 && flow?.pinning?.unpinned, 'M3A-8 editor local-graph pin flow drifted')
  requireFact(flow?.scopeSequence?.join(',') === 'neighbor,path,community,comparison,history,global', 'M3A-8 exclusive scope sequence drifted')
  requireFact(flow?.wideFits && flow?.narrowFits, 'M3A-8 combined flow has page-level overflow')
}

console.log(`M3A semantic exploration exit accepted: M3A-1 through M3A-7 retain real desktop safety evidence and exclusive combined scopes are enforced${desktop ? ', with a complete same-session Tauri workflow' : ''}.`)
