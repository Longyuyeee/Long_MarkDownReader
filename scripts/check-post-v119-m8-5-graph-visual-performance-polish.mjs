import fs from 'node:fs'

const fail = message => { throw new Error(`M8-5 graph visual/performance polish rejected: ${message}`) }
const requireFact = (condition, message) => { if (!condition) fail(message) }
const graphView = fs.readFileSync('src/components/GraphView.vue', 'utf8')
const policy = JSON.parse(fs.readFileSync('shared/post-v119-m8-5-knowledge-graph-visual-performance-polish-policy.json', 'utf8'))

requireFact(policy.appVersion === '1.0.20' && policy.stage === 'M8-5' && policy.predecessor === 'M8-4', 'policy identity drifted')
requireFact(policy.status === 'implemented-real-desktop-audit-pending' && policy.releaseCandidate === false, 'release boundary drifted')

for (const token of [
  'hoveredNode && hoveredNode.id !== selectedNode?.id',
  "semanticZoomLevel.value === 'middle' ? 12 : 20",
  'let autoFitAfterLayout = false',
  'autoFitTimer = window.setTimeout(() =>',
  'canvas.dataset.autoFitCompletionCount =',
  "denseNetwork && semanticZoomLevel.value !== 'near' ? 'priority-only' : 'all-directed'",
  "e.directed && (!denseNetwork || semanticZoomLevel.value === 'near' || isHighlight || isPathEdge)",
  'selectionEffectStartedAt > 0 && performance.now() - selectionEffectStartedAt < 420',
  '!cameraMotionReduced.value && effectAge >= 0 && effectAge < 420',
  "canvas.dataset.selectionEffect =",
]) requireFact(graphView.includes(token), `missing implementation contract: ${token}`)

const loop = graphView.slice(graphView.indexOf('const loop ='), graphView.indexOf('const startDrag ='))
requireFact(loop.includes('selectionEffectStartedAt = 0') && loop.includes("selectionEffectNodeId = ''"), 'bounded selection effect must settle and stop requesting frames')
requireFact(loop.includes('|| selectionEffectWasActive'), 'bounded selection effect must repaint through its final settled frame')
const unmount = graphView.slice(graphView.indexOf('onUnmounted(() =>'))
requireFact(unmount.includes('window.clearTimeout(autoFitTimer)'), 'post-layout fit timer must be cleaned up')

console.log('M8-5 graph visual/performance polish passed: settled auto-fit, dense priority-only arrows, restrained status rings, non-duplicated tooltip and bounded reduced-motion-safe selection feedback are present.')
