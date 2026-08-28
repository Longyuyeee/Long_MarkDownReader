import fs from 'node:fs/promises'
import { deriveGraphNodeStatus, graphNodeRecency } from '../src/utils/graphNodeStatus.ts'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const policy = await readJson('shared/post-v115-m3b11-restrained-node-status-rings-policy.json')
const predecessor = await readJson('shared/post-v115-m3b10-remaining-professional-visual-selection-policy.json')
requireFact(policy.stage === 'M3B-11' && predecessor.selectedNextStage.id === policy.stage && !policy.releaseCandidate, 'M3B-11 stage chain drifted')

const now = 2_000_000_000
requireFact(graphNodeRecency(now - 7 * 86400, now).recency === 'fresh', '7-day boundary drifted')
requireFact(graphNodeRecency(now - 30 * 86400, now).recency === 'recent', '30-day boundary drifted')
requireFact(graphNodeRecency(now - 30 * 86400 - 1, now).recency === 'none', 'older-than-30-day boundary drifted')
const node = (id, modifiedAt) => ({ id, title: id, path: id, size: 10, tags: [], directory: '', modifiedAt, objectType: 'markdown', searchText: '' })
const edge = (source, target) => ({ source, target, relationType: 'links-to', directed: true, mentions: [] })
const oracle = deriveGraphNodeStatus({
  nodes: [node('a', now), node('b', now - 10 * 86400), node('c', now - 40 * 86400), node('d', 0), node('e', now - 7 * 86400)],
  edges: [edge('a', 'b'), edge('a', 'c'), edge('a', 'd'), edge('b', 'c')],
}, now)
requireFact(oracle.freshCount === 2 && oracle.recentCount === 1 && oracle.maximumDegree === 3 && oracle.relationStrengthThreshold === 2 && oracle.relationStrengthCount === 3 && oracle.ringNodeCount === 4, 'M3B-11 independent status oracle drifted')
const uniform = deriveGraphNodeStatus({ nodes: [node('x', 0), node('y', 0)], edges: [edge('x', 'y')] }, now)
requireFact(uniform.relationStrengthCount === 0 && uniform.relationStrengthThreshold === 0, 'uniform graph invents a strength difference')

const [graphView, legend, statusUtility] = await Promise.all([
  fs.readFile('src/components/GraphView.vue', 'utf8'),
  fs.readFile('src/components/GraphSemanticLegend.vue', 'utf8'),
  fs.readFile('src/utils/graphNodeStatus.ts', 'utf8'),
])
for (const token of ['data-node-status-ring-count', 'graphNodeStatusById', 'statusPrioritySuppressed', "semanticZoomLevel.value !== 'far'", "viewMode.value === 'network'"]) requireFact(graphView.includes(token), `M3B-11 rendering contract missing: ${token}`)
for (const token of ['graph-node-status-legend', '7 天内修改', '30 天内修改', '高关系强度']) requireFact(legend.includes(token), `M3B-11 legend contract missing: ${token}`)
requireFact(!statusUtility.includes('@tauri-apps') && !statusUtility.includes('invoke(') && !statusUtility.includes('analyze_graph_health') && !statusUtility.includes('get_knowledge_graph_pulse'), 'M3B-11 status derivation invokes governance or backend data')
requireFact(!graphView.includes('data-testid="graph-node-governance-ring"'), 'M3B-11 exposed a governance ring without a node contract')

let evidenceCount = 0
for (const session of policy.requiredSessions) {
  const file = `docs/evidence/post-v115-m3b11-restrained-node-status-rings/desktop-${session.theme}-${session.motion}.json`
  let desktop
  try { desktop = await readJson(file) } catch { continue }
  evidenceCount += 1
  const actual = desktop.actual
  const rings = actual.nodeStatusRings
  requireFact(desktop.stage === 'M3B-11' && actual.theme === session.theme && actual.motion === session.motion, `M3B-11 session identity drifted: ${session.theme}/${session.motion}`)
  requireFact(actual.runtimeErrors === 0 && actual.sourceFilesUnchanged && actual.returnedToLibrary, `M3B-11 runtime or source safety drifted: ${session.theme}/${session.motion}`)
  requireFact(rings.viewports.length === 3 && rings.viewports.every(item => item.fits && item.level !== 'far' && item.ringCount > 0 && item.recencyCount > 0 && item.strengthCount > 0 && item.governanceCount === 0 && item.legendVisible && item.selectedCount === 0), `M3B-11 viewport rings drifted: ${session.theme}/${session.motion}`)
  requireFact(rings.selectedPriority.selectedCount === 1 && rings.selectedPriority.diagnostics.prioritySuppressedCount >= 1 && rings.unselected.selectedCount === 0 && rings.unselected.ringCount > rings.selectedPriority.ringCount, `M3B-11 selection priority drifted: ${session.theme}/${session.motion}`)
  requireFact(rings.hoverPriority.selectedCount === 0 && rings.hoverPriority.diagnostics.prioritySuppressedCount === 1 && rings.hoverPriority.ringCount < rings.unselected.ringCount, `M3B-11 hover priority drifted: ${session.theme}/${session.motion}`)
  requireFact(rings.middle.level === 'middle' && rings.middle.ringCount > 0 && rings.far.level === 'far' && rings.far.ringCount === 0 && !rings.far.legendVisible, `M3B-11 semantic zoom suppression drifted: ${session.theme}/${session.motion}`)
  requireFact(rings.pathPriority.pathNodeCount >= 2 && rings.pathPriority.ringCount === 0 && rings.mindmap.ringCount === 0 && rings.mindmap.diagnostics.farHidden, `M3B-11 exploration priority drifted: ${session.theme}/${session.motion}`)
  requireFact(rings.staticMotion && !rings.healthPanelOpened, `M3B-11 static/no-health contract drifted: ${session.theme}/${session.motion}`)
}
requireFact(evidenceCount === 0 || evidenceCount === policy.requiredSessions.length, 'M3B-11 desktop evidence is partial')
console.log(`M3B-11 restrained node status rings accepted: fixed recency boundaries, visible-graph strength normalization, uniform-graph safety, priority suppression and no governance scan${evidenceCount ? ` with ${evidenceCount} real Tauri sessions` : ''}.`)
