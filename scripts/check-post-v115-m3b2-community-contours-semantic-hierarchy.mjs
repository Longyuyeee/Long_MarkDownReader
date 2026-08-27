import fs from 'node:fs/promises'
import { buildGraphCommunityContours, graphCommunityContoursCoverMembers } from '../src/utils/graphSemanticZoom.ts'
import { detectGraphCommunities } from '../src/utils/graphCommunities.ts'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const policy = await readJson('shared/post-v115-m3b2-community-contours-semantic-hierarchy-policy.json')
const predecessor = await readJson('shared/post-v115-m3b1-semantic-zoom-community-overview-policy.json')
requireFact(policy.stage === 'M3B-2' && predecessor.selectedNextStage.id === policy.stage && !policy.releaseCandidate, 'M3B-2 stage chain drifted')

const node = (id, x, y, type = 'markdown') => ({ id, title: id, path: `${id}.md`, size: 18, tags: [], directory: '', modifiedAt: 1, objectType: type, searchText: id, x, y })
const edge = (source, target) => ({ source, target, relationType: 'links-to', directed: true, mentions: [] })
const graph = {
  nodes: [node('a1', 0, 0), node('a2', 80, 0), node('a3', 40, 60), node('b1', 280, 0, 'pdf'), node('b2', 360, 0, 'pdf'), node('b3', 320, 60, 'pdf')],
  edges: [edge('a1', 'a2'), edge('a2', 'a3'), edge('a3', 'a1'), edge('b1', 'b2'), edge('b2', 'b3'), edge('b3', 'b1'), edge('a3', 'b1')],
}
const before = JSON.stringify(graph.nodes.map(({ id, x, y }) => ({ id, x, y })))
const communities = detectGraphCommunities(graph).communities
const contours = buildGraphCommunityContours(graph, communities, 0.6)
requireFact(contours.length === 2 && contours.every(contour => contour.points.length >= 3 && contour.label && contour.nodeIds.length === 3), 'community contour identity or geometry drifted')
requireFact(graphCommunityContoursCoverMembers(graph, contours), 'community contour geometry does not cover every member center')
requireFact(JSON.stringify(buildGraphCommunityContours(graph, communities, 0.6)) === JSON.stringify(contours), 'community contour geometry is not deterministic')
requireFact(JSON.stringify(graph.nodes.map(({ id, x, y }) => ({ id, x, y }))) === before, 'community contour construction moved real nodes')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['buildGraphCommunityContours', 'data-community-contour-count', 'data-community-contours-cover-members', "semanticZoomLevel.value === 'middle'", "semanticZoomLevel.value === 'far'"]) requireFact(graphView.includes(token), `M3B-2 renderer contract missing: ${token}`)
requireFact(graphView.indexOf('communityContours.value.length') < graphView.indexOf('// 边 - 渐变效果'), 'community contours must render behind relationships')

const evidenceRoot = 'docs/evidence/post-v115-m3b2-community-contours-semantic-hierarchy'
let evidencePresent = false
for (const theme of policy.requiredThemes) {
  let desktop = null
  try { desktop = await readJson(`${evidenceRoot}/desktop-${theme}.json`); evidencePresent = true } catch {}
  if (!desktop) continue
  const actual = desktop.actual
  const hierarchy = actual.semanticHierarchy
  requireFact(desktop.stage === 'M3B-2' && actual.theme === theme && actual.runtimeErrors === 0, `${theme} desktop identity or runtime safety drifted`)
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, `${theme} desktop changed source files or lost library return`)
  requireFact(hierarchy?.nearContours?.count === 5 && hierarchy.nearContours.coversMembers, `${theme} near contours drifted`)
  requireFact(hierarchy?.middleContours?.count === 5 && hierarchy.middleContours.coversMembers, `${theme} middle contours drifted`)
  requireFact(hierarchy?.farContours?.count === 0 && hierarchy.stableCommunityCount === 5, `${theme} far summary continuity drifted`)
  requireFact(hierarchy?.contourViewports?.length === 3 && hierarchy.contourViewports.every(item => item.fits && item.level === 'middle' && item.count === 5 && item.coversMembers), `${theme} contour viewport contract drifted`)
  requireFact(actual.semanticZoom?.viewports?.every(item => item.fits && item.overviewVisible && item.overviewInBounds), `${theme} viewport or far overview regression`)
}
if (evidencePresent) for (const theme of policy.requiredThemes) await fs.access(`${evidenceRoot}/desktop-${theme}.json`)
console.log(`M3B-2 community contours accepted: deterministic non-layout envelopes preserve stable community identity across far/middle/near${evidencePresent ? ', with dark/light/high-contrast Tauri evidence' : ''}.`)
