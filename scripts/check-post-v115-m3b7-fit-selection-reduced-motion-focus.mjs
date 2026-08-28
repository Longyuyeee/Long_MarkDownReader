import fs from 'node:fs/promises'
import { graphCameraEase, graphCameraPoseForBounds, graphCameraPoseForPoint, interpolateGraphCameraPose } from '../src/utils/graphCamera.ts'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const close = (left, right, tolerance = 0.02) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance
const poseMatches = (actual, expected) => close(actual?.x, expected?.x) && close(actual?.y, expected?.y) && close(actual?.zoom, expected?.zoom)
const policy = await readJson('shared/post-v115-m3b7-fit-selection-reduced-motion-focus-policy.json')
const predecessor = await readJson('shared/post-v115-m3b6-navigation-camera-selection-policy.json')
requireFact(policy.stage === 'M3B-7' && predecessor.selectedNextStage.id === policy.stage && !policy.releaseCandidate, 'M3B-7 stage chain drifted')

const boundsPose = graphCameraPoseForBounds({ left: 0, right: 200, top: 0, bottom: 100 }, { x: 20, y: 10, width: 500, height: 300 }, 40)
requireFact(close(boundsPose.zoom, 1.35) && close(boundsPose.x, 135) && close(boundsPose.y, 92.5), 'fit-selection camera bounds oracle drifted')
const pointPose = graphCameraPoseForPoint({ x: 100, y: 50 }, { x: 0, y: 0, width: 600, height: 400 }, 1.2)
requireFact(close(pointPose.x, 180) && close(pointPose.y, 140), 'node focus camera oracle drifted')
requireFact(graphCameraEase(0) === 0 && graphCameraEase(0.5) === 0.5 && graphCameraEase(1) === 1, 'bounded easing endpoints drifted')
const midpoint = interpolateGraphCameraPose({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 50, zoom: 2 }, 0.5)
requireFact(close(midpoint.x, 50) && close(midpoint.y, 25) && close(midpoint.zoom, 1.5), 'camera interpolation drifted')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['data-testid="graph-fit-selection"', 'fitSelection', 'requestCameraPose', 'advanceCameraMotion', 'cancelCameraMotion', 'cameraMotionReduced', 'availableNodeFocusViewport', 'previousStructuralFilterSignature', 'graph-controls::after']) requireFact(graphView.includes(token), `M3B-7 graph contract missing: ${token}`)
requireFact(graphView.includes("void nextTick(() => centerOnNode(node))") && graphView.includes('targetNodeId ? currentNodeFocusTarget'), 'node focus does not wait for the panel or track its live target')

const evidenceRoot = 'docs/evidence/post-v115-m3b7-fit-selection-reduced-motion-focus'
let evidencePresent = false
for (const motion of policy.requiredMotionPreferences) {
  let desktop = null
  try { desktop = await readJson(`${evidenceRoot}/desktop-dark-${motion}.json`); evidencePresent = true } catch {}
  if (!desktop) continue
  const actual = desktop.actual
  const camera = actual.cameraNavigation
  requireFact(desktop.stage === 'M3B-7' && actual.theme === 'dark' && actual.motion === motion && actual.runtimeErrors === 0, `${motion} desktop identity or runtime safety drifted`)
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, `${motion} changed source files or lost library return`)
  requireFact(camera?.viewports?.length === 3 && camera.viewports.every(item => item.fits && item.fitAllReachable && item.fitSelectionReachable), `${motion} command reachability drifted`)
  requireFact(camera.viewports.find(item => item.width === 720)?.controlsScrollable, `${motion} narrow command strip does not scroll`)
  const focus = camera.focus
  const expectedFocusPose = graphCameraPoseForPoint(focus.complete.diagnostics.point, focus.complete.diagnostics.viewport, focus.complete.pose.zoom)
  requireFact(focus.complete.reason === 'node-focus' && focus.complete.selectedCount === 1 && focus.complete.detailsOverlap && focus.complete.diagnostics.viewport.width < 1280 && poseMatches(focus.complete.pose, expectedFocusPose) && focus.stableAfterCompletion, `${motion} panel-safe node focus drifted`)
  const fit = camera.fitSelection
  const expectedFitPose = graphCameraPoseForBounds(fit.diagnostics.bounds, fit.diagnostics.viewport)
  requireFact(fit.enabled && fit.selectedCount >= 2 && fit.selectedCount < 17 && fit.diagnostics.nodeCount === fit.selectedCount && poseMatches(fit.pose, expectedFitPose) && fit.stableAfterCompletion, `${motion} fit-selection result drifted`)
  if (motion === 'calm') {
    requireFact(focus.start.state === 'running' && !focus.start.reduced && focus.complete.state === 'completed' && focus.complete.frames > 0 && focus.elapsedMs >= 180 && focus.elapsedMs < 700, 'calm focus is not bounded animation')
    requireFact(camera.replacementFocus.state === 'completed' && camera.replacementFocus.cancellations > camera.replacementFocus.cancellationsBefore, 'calm replacement focus did not cancel the old target')
    requireFact(fit.state === 'completed' && fit.frames > 0, 'calm fit-selection did not use the bounded camera transition')
  } else {
    requireFact(focus.start.state === 'reduced' && focus.start.reduced && focus.complete.state === 'reduced' && focus.complete.frames === 0 && focus.elapsedMs < 180, 'reduced focus was not immediate')
    requireFact(camera.replacementFocus.state === 'reduced' && fit.state === 'reduced' && fit.frames === 0, 'reduced camera flow animated')
  }
}
if (evidencePresent) for (const motion of policy.requiredMotionPreferences) await fs.access(`${evidenceRoot}/desktop-dark-${motion}.json`)
console.log(`M3B-7 camera navigation accepted: fit-selection, bounded cancellable focus, reduced-motion immediacy and narrow command reachability${evidencePresent ? ' with real calm/reduced Tauri evidence' : ''}.`)
