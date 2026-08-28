import fs from 'node:fs/promises'
import { buildGraphEdgeRoutes, graphQuadraticGeometry, graphQuadraticLabelPoint, graphQuadraticPathData, graphQuadraticPoint, graphQuadraticTangent } from '../src/utils/graphEdgeRoutes.ts'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const policy = await readJson('shared/post-v115-m3b4-curved-parallel-relations-static-path-labels-policy.json')
const predecessor = await readJson('shared/post-v115-m3b3-path-relationship-visual-selection-policy.json')
requireFact(policy.stage === 'M3B-4' && predecessor.selectedNextStage.id === policy.stage && !policy.releaseCandidate, 'M3B-4 stage chain drifted')

const edge = (source, target, relationType, line) => ({ source, target, relationType, directed: true, mentions: [{ target, syntax: `[[${target}]]`, context: relationType, line, relationType }] })
const edges = [edge('alpha', 'beta', 'depends-on', 4), edge('beta', 'alpha', 'supports', 8), edge('alpha', 'beta', 'cites', 12)]
const routes = buildGraphEdgeRoutes(edges)
const reordered = buildGraphEdgeRoutes([edges[2], edges[0], edges[1]])
const routeFacts = value => value.map(route => ({ id: route.routeId, offset: route.curveOffset, type: route.edge.relationType }))
requireFact(JSON.stringify(routeFacts(routes)) === JSON.stringify(routeFacts(reordered)), 'parallel route identity depends on edge input order')
requireFact(routes.length === 3 && new Set(routes.map(route => route.curveOffset)).size === 3 && routes.every(route => route.curveOffset !== 0), 'parallel/reciprocal routes are not visibly separated curves')

const points = new Map([['alpha', { x: 0, y: 0 }], ['beta', { x: 180, y: 40 }]])
for (const route of routes) {
  const geometry = graphQuadraticGeometry(route, points)
  requireFact(geometry, 'route geometry is unavailable')
  const point = graphQuadraticPoint(geometry, 0.72)
  const tangent = graphQuadraticTangent(geometry, 0.72)
  const factDirection = { x: geometry.target.x - geometry.source.x, y: geometry.target.y - geometry.source.y }
  requireFact(Number.isFinite(point.x) && Number.isFinite(point.y) && tangent.x * factDirection.x + tangent.y * factDirection.y > 0, 'curve tangent does not preserve fact direction')
  requireFact(graphQuadraticPathData(geometry).includes(' Q '), 'shared SVG quadratic path data is unavailable')
  const labelPoint = graphQuadraticLabelPoint(geometry, route.curveOffset, 20)
  requireFact(Number.isFinite(labelPoint.x) && Number.isFinite(labelPoint.y), 'bounded path label placement is unavailable')
}

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['visibleEdgeRoutes', 'ctx.quadraticCurveTo', 'graphQuadraticTangent', 'data-path-relation-label-count', 'data-path-camera-safe', 'availableGraphViewport']) requireFact(graphView.includes(token), `M3B-4 renderer contract missing: ${token}`)
requireFact(!graphView.includes('store.motionSpeed'), 'M3B-4 expanded into deferred motion preference consumption')
const graphWorkspace = await fs.readFile('src/utils/graphWorkspace.ts', 'utf8')
for (const token of ['buildGraphEdgeRoutes', 'graphQuadraticPathData', 'data-route-id', 'class="relation-label"', 'showRelationLabels']) requireFact(graphWorkspace.includes(token), `M3B-4 SVG contract missing: ${token}`)

const evidenceRoot = 'docs/evidence/post-v115-m3b4-curved-parallel-relations-static-path-labels'
let evidencePresent = false
for (const theme of policy.requiredThemes) {
  let desktop = null
  try { desktop = await readJson(`${evidenceRoot}/desktop-${theme}.json`); evidencePresent = true } catch {}
  if (!desktop) continue
  const actual = desktop.actual
  requireFact(desktop.stage === 'M3B-4' && actual.theme === theme && actual.runtimeErrors === 0, `${theme} desktop identity or runtime safety drifted`)
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, `${theme} desktop changed source files or lost library return`)
  requireFact(actual.pathVisual?.evidenceEdgeCount === 3 && actual.pathVisual.pathLabelCount === 3, `${theme} verified path evidence or labels drifted`)
  requireFact(actual.pathVisual.parallelRouteCount >= 2 && actual.pathVisual.curvedRouteCount === 17, `${theme} real graph curved/parallel route baseline drifted`)
  requireFact(actual.pathVisual.viewports?.length === 3 && actual.pathVisual.viewports.every(item => item.fits && item.cameraSafe && item.panelInBounds && item.pathLabelCount === 3), `${theme} path camera or viewport contract drifted`)
}
if (evidencePresent) for (const theme of policy.requiredThemes) await fs.access(`${evidenceRoot}/desktop-${theme}.json`)
console.log(`M3B-4 curved relation routes accepted: deterministic parallel/reciprocal separation, tangent arrows, selected-path labels and shared SVG routing${evidencePresent ? ', with three-theme real Tauri evidence' : ''}.`)
