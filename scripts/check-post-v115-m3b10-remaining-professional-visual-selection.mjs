import fs from 'node:fs/promises'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const policy = await readJson('shared/post-v115-m3b10-remaining-professional-visual-selection-policy.json')
const predecessor = await readJson('shared/post-v115-m3b9-bounded-semantic-minimap-policy.json')
requireFact(policy.stage === 'M3B-10' && predecessor.selectedNextStage.id === policy.stage && !policy.releaseCandidate, 'M3B-10 stage chain drifted')
requireFact(policy.decision.selectedIncrement === 'restrained-recency-and-relation-strength-node-rings', 'M3B-10 selected increment drifted')
requireFact(policy.decision.requiredContract.includes('no-health-scan-or-governance-ring'), 'M3B-10 governance boundary drifted')

const [graphView, graphHealth, graphTypes, graphBackend] = await Promise.all([
  fs.readFile('src/components/GraphView.vue', 'utf8'),
  fs.readFile('src/components/GraphHealthPanel.vue', 'utf8'),
  fs.readFile('src/types/graph.ts', 'utf8'),
  fs.readFile('src-tauri/src/commands/graph.rs', 'utf8'),
])
for (const token of ['const degreeMap = computed', 'nodeDegree', 'data-testid="graph-minimap"', 'showCommunityOverview']) requireFact(graphView.includes(token), `M3B-10 graph prerequisite missing: ${token}`)
requireFact(graphTypes.includes('modifiedAt: number') && graphBackend.includes('modified_at: modified_timestamp'), 'M3B-10 real recency source drifted')
for (const token of ["invoke<HealthReport>('analyze_graph_health'", "invoke<KnowledgeGraphPulse>('get_knowledge_graph_pulse'"]) requireFact(graphHealth.includes(token), `M3B-10 governance source fact missing: ${token}`)
for (const absent of ['data-testid="graph-node-status-ring"', 'data-testid="graph-cluster-collapse"']) requireFact(!graphView.includes(absent), `M3B-10 current capability fact drifted: ${absent}`)
const fullscreenImplemented = graphView.includes('data-testid="graph-fullscreen"')
if (fullscreenImplemented) requireFact(graphView.includes('container.requestFullscreen()') && graphView.includes("document.addEventListener('fullscreenchange'"), 'M6-1 successor fullscreen contract is incomplete')

let desktop = null
try { desktop = await readJson('docs/evidence/post-v115-m3b10-remaining-professional-visual-selection/desktop.json') } catch {}
if (desktop) {
  const actual = desktop.actual
  const selection = actual.remainingVisualSelection
  requireFact(desktop.stage === 'M3B-10' && actual.theme === 'dark' && actual.motion === 'reduced' && actual.runtimeErrors === 0, 'M3B-10 desktop identity or runtime safety drifted')
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, 'M3B-10 changed source files or lost library return')
  requireFact(selection?.viewports?.length === 3 && selection.viewports.every(item => item.fits && item.canvasVisible && item.minimapVisible && !item.nodeStatusRingVisible && !item.clusterCollapseExpandVisible && !item.fullscreenVisible), 'M3B-10 three-viewport capability evidence drifted')
  requireFact(selection.sourceSignals.uniqueModifiedAtCount >= 6 && selection.sourceSignals.relationStrengthObserved, 'M3B-10 real recency or relation-strength source evidence drifted')
  requireFact(selection.health.objectCount > 0 && selection.health.relationCount > 0 && selection.health.topics.some(item => item.relationCount > 0) && selection.health.panelFits && selection.health.narrowFits, 'M3B-10 real health/pulse evidence drifted')
  requireFact(selection.capabilities.minimap && selection.capabilities.communityFilteredSubgraph && !selection.capabilities.nodeStatusRings && !selection.capabilities.clusterCollapseExpand && !selection.capabilities.fullscreen, 'M3B-10 selection facts drifted')
}
console.log(`M3B-10 remaining professional visual selection accepted: restrained recency and relation-strength rings selected${desktop ? ' from real Tauri three-viewport, filesystem timestamp and health/pulse evidence' : ''}; governance rings, cluster collapse/expand, fullscreen and M3C remain deferred.`)
