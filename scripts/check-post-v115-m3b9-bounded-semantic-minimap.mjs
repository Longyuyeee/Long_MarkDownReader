import fs from 'node:fs/promises'
import { graphMinimapProjection, graphMinimapViewportRect, graphMinimapWorldPoint } from '../src/utils/graphMinimap.ts'
import { graphCameraPoseForPoint } from '../src/utils/graphCamera.ts'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const close = (left, right, tolerance = 0.03) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance
const poseMatches = (actual, expected) => close(actual?.x, expected?.x) && close(actual?.y, expected?.y) && close(actual?.zoom, expected?.zoom)
const policy = await readJson('shared/post-v115-m3b9-bounded-semantic-minimap-policy.json')
const predecessor = await readJson('shared/post-v115-m3b8-remaining-navigation-selection-policy.json')
requireFact(policy.stage === 'M3B-9' && predecessor.selectedNextStage.id === policy.stage && !policy.releaseCandidate, 'M3B-9 stage chain drifted')

const fixture = [
  { id: 'a', x: 0, y: 0, objectType: 'markdown' },
  { id: 'b', x: 200, y: 100, objectType: 'pdf' },
]
const projection = graphMinimapProjection(fixture, 120, 80, 600, 10)
requireFact(projection && close(projection.scale, 0.5) && close(projection.offsetX, 10) && close(projection.offsetY, 15), 'minimap projection oracle drifted')
const world = graphMinimapWorldPoint(projection, { x: 60, y: 40 })
requireFact(close(world.x, 100) && close(world.y, 50), 'minimap inverse projection drifted')
const viewport = graphMinimapViewportRect(projection, { x: 10, y: 15, zoom: 0.5 }, { width: 50, height: 25 })
requireFact(close(viewport.x, 0) && close(viewport.y, 0) && close(viewport.width, 50) && close(viewport.height, 25), 'minimap viewport oracle drifted')
const large = graphMinimapProjection(Array.from({ length: 5000 }, (_, index) => ({ id: String(index), x: index % 100, y: Math.floor(index / 100), objectType: 'markdown' })), 170, 104)
requireFact(large?.sourceNodeCount === 5000 && large.points.length <= policy.requirements.maximumRenderedPoints && large.points.length >= 500, '5000-node minimap sampling is not bounded')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['data-testid="graph-minimap"', 'data-testid="graph-minimap-canvas"', 'drawMinimap', 'graphMinimapViewportRect', 'startMinimapNavigation', 'moveMinimapNavigation', 'handleMinimapKeydown', "requestCameraPose(target, 'minimap-click')", "cameraMotionReason.value = 'minimap-drag'", 'maximumPoints: 600']) requireFact(graphView.includes(token), `M3B-9 graph contract missing: ${token}`)
const minimapDraw = graphView.slice(graphView.indexOf('const drawMinimap'), graphView.indexOf('const minimapLocalPoint'))
requireFact(!minimapDraw.includes('fillText'), 'minimap must not render node labels')

const evidenceRoot = 'docs/evidence/post-v115-m3b9-bounded-semantic-minimap'
let evidencePresent = false
const evidenceRecords = []
for (const session of policy.requiredSessions) {
  let desktop = null
  try { desktop = await readJson(`${evidenceRoot}/desktop-${session.theme}-${session.motion}.json`); evidencePresent = true } catch {}
  if (!desktop) continue
  evidenceRecords.push(desktop)
  const actual = desktop.actual
  const minimap = actual.minimapNavigation
  requireFact(desktop.stage === 'M3B-9' && actual.theme === session.theme && actual.motion === session.motion && actual.runtimeErrors === 0, `${session.theme}/${session.motion} identity or runtime safety drifted`)
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, `${session.theme}/${session.motion} changed source files or lost library return`)
  requireFact(minimap?.viewports?.length === 3 && minimap.viewports.every(item => item.fits && item.minimapRect?.width > 0 && item.cameraInitialized && item.viewportInBounds && item.sourceNodeCount === 17 && item.renderedPointCount === 17 && !item.overlaps.details && !item.overlaps.legend && !item.overlaps.stats), `${session.theme}/${session.motion} responsive minimap facts drifted`)
  const setup = minimap.clickSetup
  const projectedWorld = graphMinimapWorldPoint({ ...setup.diagnostics, points: [], sourceNodeCount: 17 }, { x: setup.localX, y: setup.localY })
  const expectedClickPose = graphCameraPoseForPoint(projectedWorld, { x: 0, y: 0, width: setup.mainWidth, height: setup.mainHeight }, setup.beforePose.zoom)
  requireFact(minimap.click.motionReason === 'minimap-click' && minimap.click.navigationState === 'click' && minimap.click.navigationCount === 1 && minimap.click.viewportInBounds && poseMatches(minimap.click.pose, expectedClickPose), `${session.theme}/${session.motion} click navigation drifted`)
  requireFact(minimap.drag.motionReason === 'minimap-drag' && minimap.drag.navigationState === 'drag' && minimap.drag.navigationCount === 2 && minimap.drag.viewportInBounds && !poseMatches(minimap.drag.pose, minimap.dragSetup.beforePose), `${session.theme}/${session.motion} drag navigation drifted`)
  requireFact(minimap.keyboard.motionReason === 'minimap-keyboard' && minimap.keyboard.navigationCount === 3 && minimap.keyboard.viewportInBounds && !poseMatches(minimap.keyboard.pose, minimap.keyboard.beforePose), `${session.theme}/${session.motion} keyboard navigation drifted`)
  requireFact(minimap.far.semanticZoomLevel === 'far' && !minimap.far.overlap, `${session.theme}/${session.motion} far overview collision drifted`)
  if (session.motion === 'calm') requireFact(minimap.click.motionState === 'completed' && minimap.click.motionFrames > 0 && minimap.click.elapsedMs >= 180 && minimap.click.elapsedMs < 700, 'calm minimap click is not a bounded transition')
  else requireFact(minimap.click.motionState === 'reduced' && minimap.click.motionFrames === 0 && minimap.click.elapsedMs < 180, `${session.theme} reduced minimap click animated`)
}
if (evidencePresent) {
  for (const session of policy.requiredSessions) await fs.access(`${evidenceRoot}/desktop-${session.theme}-${session.motion}.json`)
  const audit = await fs.readFile('docs/Post_v1.0.15_M3B9_Bounded_Semantic_Minimap_and_Viewport_Navigation_Audit_2026-08-28.md', 'utf8')
  const calm = evidenceRecords.find(item => item.actual.motion === 'calm').actual.minimapNavigation.click
  const reducedTimes = evidenceRecords.filter(item => item.actual.motion === 'reduced').map(item => item.actual.minimapNavigation.click.elapsedMs)
  requireFact(audit.includes(`calm \`${calm.elapsedMs}ms/${calm.motionFrames}帧\``) && audit.includes(`reduced \`${Math.min(...reducedTimes)}～${Math.max(...reducedTimes)}ms/0帧\``), 'M3B-9 audit timing facts drifted from real evidence')
}
console.log(`M3B-9 semantic minimap accepted: bounded sampling, label-free semantic overview, viewport frame, click/drag/keyboard navigation and responsive overlay safety${evidencePresent ? ' with four real Tauri sessions' : ''}.`)
