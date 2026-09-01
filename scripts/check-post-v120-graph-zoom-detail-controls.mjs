import fs from 'node:fs'
import { graphReadableZoomFloor } from '../src/utils/graphSemanticZoom.ts'

const fail = message => { throw new Error(`Post-v1.0.20 graph interaction polish rejected: ${message}`) }
const requireFact = (condition, message) => { if (!condition) fail(message) }
const graphView = fs.readFileSync('src/components/GraphView.vue', 'utf8')

const smallFloor = graphReadableZoomFloor(83, false)
const mediumFloor = graphReadableZoomFloor(180, false)
requireFact(smallFloor === 0.58 && mediumFloor >= 0.64 && mediumFloor < 0.65, 'ordinary 83/180-node graphs must stop at a readable zoom floor')
requireFact(graphReadableZoomFloor(1000, true) === 0.16, 'explicit large-graph community overview must retain bounded navigation range')

for (const token of [
  'visibleNodes.value.length >= 240',
  'Math.max(minimumZoomLevel.value, Math.min(3, zoom * factor))',
  'const nextZoom = Math.max(minimumZoomLevel.value, Math.min(3, pose.zoom))',
  "`${zoom.toFixed(3)}\\u001e${visibleGraphSignature.value}\\u001e${minimapLayoutRevision}`",
  'Math.abs(nextViewX - viewX) > 0.5',
  '<n-select class="graph-option-select graph-layout-select"',
  '<n-select class="graph-option-select graph-theme-select"',
  '<n-select class="graph-option-select graph-depth-select"',
  'width: var(--workspace-inspector-width);',
  'max-width: min(380px, calc(100% - 32px));',
]) requireFact(graphView.includes(token), `missing implementation contract: ${token}`)

requireFact(!graphView.includes('const layoutRefresh = communityOverviewFrame'), 'settled overview must not be rebuilt every animation frame')
requireFact(!/ctx\.fillText\(label, community\.x, community\.y - 6 \/ zoom,/.test(graphView), 'community titles must not be horizontally compressed with Canvas maxWidth')
requireFact(graphView.includes('专业 · 克制网格') && graphView.includes('多彩 · 语义光域') && graphView.includes('专注 · 纯净画布'), 'theme choices must explain visibly distinct canvas treatments')

console.log(`Post-v1.0.20 graph interaction polish passed: ordinary zoom floors are ${smallFloor.toFixed(3)}/${mediumFloor.toFixed(3)}, large overview remains bounded, details are card-sized, and themed popup controls replace native selects.`)
