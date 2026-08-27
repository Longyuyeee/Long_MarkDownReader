import fs from 'node:fs/promises'
import { buildGraphCommunityOverview, resolveGraphSemanticZoom, selectSemanticZoomKeyNodes } from '../src/utils/graphSemanticZoom.ts'
import { detectGraphCommunities } from '../src/utils/graphCommunities.ts'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const policy = await readJson('shared/post-v115-m3b1-semantic-zoom-community-overview-policy.json')
const selection = await readJson('shared/post-v115-m3b0-professional-visual-baseline-policy.json')

requireFact(policy.stage === 'M3B-1' && !policy.releaseCandidate && selection.selectedNextStage.id === policy.stage, 'M3B-1 stage chain drifted')
requireFact(resolveGraphSemanticZoom(1, 17).level === 'near', '17-node default view should be near')
requireFact(resolveGraphSemanticZoom(0.55, 17).level === 'middle', '17-node middle zoom should be middle')
requireFact(resolveGraphSemanticZoom(0.28, 17).level === 'far', '17-node far zoom should be far')
requireFact(resolveGraphSemanticZoom(1, 1000).level === 'far' && resolveGraphSemanticZoom(1, 5000).level === 'far', 'large graphs should enter density-aware far overview at default zoom')

const node = (id, x, y, modifiedAt = 0) => ({ id, title: id, path: `${id}.md`, size: 12, tags: [id[0]], directory: '', modifiedAt, objectType: id.startsWith('a') ? 'markdown' : 'pdf', searchText: id, x, y })
const edge = (source, target) => ({ source, target, relationType: 'links-to', directed: true, mentions: [] })
const graph = {
  nodes: [node('a1', 0, 0), node('a2', 10, 0), node('a3', 5, 10), node('b1', 8, 4), node('b2', 18, 4), node('b3', 13, 14)],
  edges: [edge('a1', 'a2'), edge('a1', 'a3'), edge('a2', 'a3'), edge('b1', 'b2'), edge('b1', 'b3'), edge('b2', 'b3'), edge('a3', 'b1')],
}
const communities = detectGraphCommunities(graph).communities
const overview = buildGraphCommunityOverview(graph, communities, 0.28)
requireFact(overview.nodes.length === 2 && overview.edges.length === 1 && overview.edges[0].edgeCount === 1, 'community overview must aggregate the two dense groups and their cross edge')
requireFact(overview.nodes.every(item => item.nodeCount === 3 && item.internalEdgeCount === 3 && item.label), 'community summary counts or labels drifted')
const [left, right] = overview.nodes
requireFact(Math.hypot(left.x - right.x, left.y - right.y) >= left.radius + right.radius, 'community overview overlap separation failed')
requireFact(JSON.stringify(buildGraphCommunityOverview(graph, communities, 0.28)) === JSON.stringify(overview), 'community overview geometry is not deterministic')
requireFact(selectSemanticZoomKeyNodes(graph)[0].id === 'a3' || selectSemanticZoomKeyNodes(graph)[0].id === 'b1', 'middle key-node ranking must prioritize graph degree')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['graph-semantic-zoom-status', 'graph-community-overview', 'graph-community-overview-entry', 'data-semantic-zoom-level', 'buildGraphCommunityOverview', 'selectSemanticZoomKeyNodes']) requireFact(graphView.includes(token), `M3B-1 UI contract missing: ${token}`)
requireFact(graphView.includes("semanticZoomLevel.value === 'near'") && graphView.includes("semanticZoomLevel.value === 'middle'"), 'near/middle title hierarchy is not consumed by the renderer')

const evidenceRoot = 'docs/evidence/post-v115-m3b1-semantic-zoom-community-overview'
let evidencePresent = false
for (const theme of policy.requiredThemes) {
  let desktop = null
  try { desktop = await readJson(`${evidenceRoot}/desktop-${theme}.json`); evidencePresent = true } catch {}
  if (!desktop) continue
  const actual = desktop.actual
  const zoom = actual.semanticZoom
  requireFact(desktop.stage === 'M3B-1' && actual.theme === theme && actual.runtimeErrors === 0, `${theme} desktop identity or runtime safety drifted`)
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, `${theme} desktop changed source files or lost library return`)
  requireFact(zoom?.levels?.join(',') === 'near,middle,far' && zoom.communityCount === 5, `${theme} semantic levels or community count drifted`)
  requireFact(zoom.enteredCommunityNodeCount === 4 && zoom.returnedToOverview && zoom.overviewEntryCount === 5, `${theme} community overview entry/return drifted`)
  requireFact(zoom.viewports?.every(item => item.fits && item.overviewVisible && item.overviewInBounds), `${theme} viewport overview bounds or page fit drifted`)
  requireFact(zoom.motionPreference === 'reduced', `${theme} reduced-motion evidence drifted`)
}
if (evidencePresent) {
  for (const theme of policy.requiredThemes) {
    try { await fs.access(`${evidenceRoot}/desktop-${theme}.json`) } catch { throw new Error(`M3B-1 theme evidence missing: ${theme}`) }
  }
}

console.log(`M3B-1 semantic zoom accepted: density-aware far/middle/near levels, deterministic community aggregation, key-node ranking and accessible community entry are aligned${evidencePresent ? ', with dark/light/high-contrast Tauri evidence' : ''}.`)
