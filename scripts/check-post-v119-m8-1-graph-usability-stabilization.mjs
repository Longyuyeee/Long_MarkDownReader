import fs from 'node:fs'
import { shouldUseGraphCommunityOverview } from '../src/utils/graphSemanticZoom.ts'

const fail = message => { throw new Error(`M8-1 graph usability stabilization rejected: ${message}`) }
const requireFact = (condition, message) => { if (!condition) fail(message) }
const graphView = fs.readFileSync('src/components/GraphView.vue', 'utf8')
const legend = fs.readFileSync('src/components/GraphSemanticLegend.vue', 'utf8')
const policy = JSON.parse(fs.readFileSync('shared/post-v119-m8-1-knowledge-graph-usability-stabilization-policy.json', 'utf8'))

const singleton = index => ({ id: `singleton-${index}`, label: `Node ${index}`, nodeIds: [`node-${index}`], nodeCount: 1, internalEdgeCount: 0, externalEdgeCount: 0, representativeTitles: [], objectTypes: [] })
const dense = index => ({ id: `dense-${index}`, label: `Group ${index}`, nodeIds: Array.from({ length: 8 }, (_, member) => `${index}-${member}`), nodeCount: 8, internalEdgeCount: 10, externalEdgeCount: 2, representativeTitles: [], objectTypes: [] })

requireFact(policy.stage === 'M8-1' && policy.status === 'implemented-static-audit-passed' && policy.releaseCandidate === false, 'policy identity drifted')
requireFact(!shouldUseGraphCommunityOverview(Array.from({ length: 540 }, (_, index) => singleton(index)), 540), '540 singleton nodes must not render as 540 labelled community bubbles')
requireFact(shouldUseGraphCommunityOverview(Array.from({ length: 5 }, (_, index) => dense(index)), 40), 'a small meaningful community set must retain the far overview')

for (const token of [
  '@pointerdown="startDrag"', '@pointermove="onDrag"', '@pointerup="endDrag"', '@pointercancel="cancelDrag"',
  'canvas.setPointerCapture(e.pointerId)',
  'Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY) < 6',
  'if (pendingCommunityId && !wasDragging) selectCommunity(pendingCommunityId)',
  'const width = Math.max(1, Math.round(canvas.clientWidth))',
  'const pixelWidth = Math.max(1, Math.round(width * dpr))',
  'shouldUseGraphCommunityOverview', 'touch-action: none',
  '.graph-container:has(.graph-filter-control[open]) :deep(.graph-semantic-legend) { visibility: hidden; }',
]) requireFact(graphView.includes(token), `interaction or rendering contract missing: ${token}`)

const endDrag = graphView.slice(graphView.indexOf('const endDrag ='), graphView.indexOf('const cancelDrag ='))
requireFact(!endDrag.includes("emit('selectFile'"), 'single-click release must not open a document')
const draw = graphView.slice(graphView.indexOf('const draw ='), graphView.indexOf('const loop =', graphView.indexOf('const draw =')))
requireFact(!draw.includes('canvas.style.width') && !draw.includes('canvas.style.height'), 'draw loop must not rewrite the canvas CSS size')

for (const token of ['const collapsed = ref(true)', '图例与操作', '拖动 · 滚轮 · 双击打开', '单击选择节点，双击才会打开文件', '.object-mark span { display: none; }']) {
  requireFact(legend.includes(token), `legend usability contract missing: ${token}`)
}

console.log('M8-1 graph usability stabilization passed: stable backing size, pointer-captured pan/drag, select-vs-open separation, singleton-overview suppression, compact help and clean semantic marks are present.')
