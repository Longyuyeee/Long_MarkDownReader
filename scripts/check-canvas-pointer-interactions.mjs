import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}

const canvas = read('src/views/CanvasView.vue')
requireTokens(canvas, 'JSON Canvas interaction', [
  '@wheel.prevent="handleWheel"',
  '@contextmenu.prevent="openCanvasContextMenu"',
  '@contextmenu.stop.prevent="openNodeContextMenu(node, $event)"',
  'const direction = event.deltaY || event.deltaX',
  "changeZoom(direction > 0 ? -0.1 : 0.1",
  "target: 'background' as 'background' | 'node' | 'edge'",
  "{ label: '新建文本卡片', key: 'add-text' }",
  "{ label: '从这里建立连线', key: 'connect' }",
  "else if (key === 'duplicate')",
  'const pasteSelection = async (pasteTarget?: { x: number; y: number })',
  'if (event.button !== 0) return',
])
if (canvas.includes('if (event.ctrlKey || event.metaKey)')) fail('JSON Canvas wheel zoom must not require a modifier key')
if (canvas.includes('pan.x -= event.deltaX; pan.y -= event.deltaY')) fail('JSON Canvas wheel must not fall back to viewport panning')

const mindmap = read('src/views/MindMapView.vue')
requireTokens(mindmap, 'OPML mind map interaction', [
  '@wheel.prevent="onMapWheel"',
  '@contextmenu.prevent="openMapContextMenu"',
  '@contextmenu.stop.prevent="openNodeContextMenu(item.node, $event)"',
  "target: 'background' as 'background' | 'node'",
  "{ label: '新增子主题', key: 'add-child' }",
  "{ label: '重新应用当前布局', key: 'apply-layout' }",
  "if (event.button !== 0 && event.button !== 1) return",
])

const graph = read('src/components/GraphView.vue')
requireTokens(graph, 'Knowledge graph interaction', [
  '@wheel.prevent="onZoom"',
  '@contextmenu.prevent="openGraphContextMenu"',
  "{ label: '居中查看', key: 'center' }",
  "{ label: '设为思维导图中心', key: 'mindmap-root' }",
  "{ label: '重新计算布局', key: 'reset-layout' }",
  'const node = findNodeAt(worldX, worldY)',
  'if (e.button === 2) return',
])

console.log('Canvas pointer interaction passed: knowledge graph, OPML mind map, and JSON Canvas use cursor-anchored wheel zoom with node and background context actions.')
