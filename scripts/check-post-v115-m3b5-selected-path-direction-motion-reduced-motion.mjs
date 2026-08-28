import fs from 'node:fs/promises'
import { advanceGraphPathMotionPhase, graphPathDashOffset, graphPathMotionPixelsPerSecond, graphPathTraversalDirection } from '../src/utils/graphPathMotion.ts'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const policy = await readJson('shared/post-v115-m3b5-selected-path-direction-motion-reduced-motion-policy.json')
const predecessor = await readJson('shared/post-v115-m3b4-curved-parallel-relations-static-path-labels-policy.json')
requireFact(policy.stage === 'M3B-5' && predecessor.selectedNextStage.id === policy.stage && !policy.releaseCandidate, 'M3B-5 stage chain drifted')

const edge = { source: 'alpha', target: 'beta', relationType: 'depends-on', directed: true, mentions: [] }
requireFact(graphPathTraversalDirection(['alpha', 'beta'], edge) === 1, 'selected path forward traversal is unavailable')
requireFact(graphPathTraversalDirection(['beta', 'alpha'], edge) === -1, 'selected path reverse traversal is unavailable')
requireFact(graphPathTraversalDirection(['alpha', 'gamma'], edge) === 0, 'unselected edge received a path traversal direction')
requireFact(graphPathDashOffset(6, 1, 1) === -6 && graphPathDashOffset(6, -1, 1) === 6, 'dash flow does not follow selected start-to-end traversal')
requireFact(graphPathMotionPixelsPerSecond('swift') > graphPathMotionPixelsPerSecond('calm') && graphPathMotionPixelsPerSecond('expressive') > graphPathMotionPixelsPerSecond('swift'), 'motion preference speed contract drifted')
requireFact(advanceGraphPathMotionPhase(0, 200, 'calm') > 0 && advanceGraphPathMotionPhase(8, 200, 'reduced') === 0, 'normal/reduced phase contract drifted')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['pathMotionEnabled', 'graphPathTraversalDirection', 'graphPathDashOffset', 'store.motionSpeed', "matchMedia('(prefers-reduced-motion: reduce)')", 'handleWindowBlur', 'handleWindowFocus', 'pauseGraphLoop', 'data-path-motion-state', 'data-path-motion-traversal-segments']) requireFact(graphView.includes(token), `M3B-5 graph contract missing: ${token}`)
requireFact(graphView.includes('ctx.setLineDash([7 / zoom, 17 / zoom])') && graphView.includes('if (isPathEdge && routeGeometry && pathMotionEnabled.value'), 'direction flow escaped the verified selected path')
requireFact(graphView.includes('cancelAnimationFrame(animationId)') && graphView.includes("window.removeEventListener('blur', handleWindowBlur)"), 'inactive/unmount animation cleanup drifted')

const evidenceRoot = 'docs/evidence/post-v115-m3b5-selected-path-direction-motion-reduced-motion'
let evidencePresent = false
for (const theme of policy.requiredThemes) {
  for (const motion of policy.requiredMotionPreferences) {
    let desktop = null
    try { desktop = await readJson(`${evidenceRoot}/desktop-${theme}-${motion}.json`); evidencePresent = true } catch {}
    if (!desktop) continue
    const actual = desktop.actual
    const pathMotion = actual.pathMotion
    requireFact(desktop.stage === 'M3B-5' && actual.theme === theme && actual.motion === motion && actual.runtimeErrors === 0, `${theme}/${motion} desktop identity or runtime safety drifted`)
    requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, `${theme}/${motion} changed source files or lost library return`)
    requireFact(actual.pathVisual?.evidenceEdgeCount === 3 && actual.pathVisual.pathLabelCount === 3, `${theme}/${motion} static path evidence or labels drifted`)
    requireFact(pathMotion?.preference === motion && pathMotion.viewports?.length === 2, `${theme}/${motion} motion viewport evidence drifted`)
    requireFact(pathMotion.viewports.every(item => item.traversalSegments === 3 && item.forwardSegments === 1 && item.reverseSegments === 2 && item.labelCount === 3), `${theme}/${motion} selected forward/reverse traversal or static labels drifted`)
    if (motion === 'calm') {
      requireFact(pathMotion.viewports.every(item => item.state === 'running' && !item.reduced && item.phaseChanged && item.framesAdvanced && item.pixelsChanged), `${theme}/calm real selected-path motion did not advance`)
      requireFact(pathMotion.pause.state === 'paused' && pathMotion.pause.framesStable && pathMotion.resume.state === 'running' && pathMotion.resume.framesAdvanced, `${theme}/calm blur pause/resume contract drifted`)
    } else {
      requireFact(pathMotion.viewports.every(item => item.state === 'reduced' && item.reduced && !item.phaseChanged && !item.framesAdvanced && !item.pixelsChanged), `${theme}/reduced path flow was not completely static`)
      requireFact(pathMotion.pause.framesStable && pathMotion.resume.state === 'reduced' && !pathMotion.resume.framesAdvanced && pathMotion.resume.framesStable, `${theme}/reduced lifecycle contract drifted`)
    }
  }
}
if (evidencePresent) for (const theme of policy.requiredThemes) for (const motion of policy.requiredMotionPreferences) await fs.access(`${evidenceRoot}/desktop-${theme}-${motion}.json`)
console.log(`M3B-5 path motion accepted: selected traversal flow, independent fact arrows, static labels, reduced-motion shutdown and inactive lifecycle cleanup${evidencePresent ? ', with three-theme calm/reduced real Tauri evidence' : ''}.`)
