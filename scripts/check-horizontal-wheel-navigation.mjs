import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}

const service = read('src/services/horizontalWheel.ts')
requireTokens(service, 'Global horizontal wheel service', [
  "document.addEventListener('wheel', handleWheel, { passive: false })",
  'event.defaultPrevented || event.ctrlKey || event.metaKey',
  'Math.abs(event.deltaX) > Math.abs(event.deltaY)',
  'NATIVE_WHEEL_CONTROL_SELECTOR',
  'element.scrollWidth <= element.clientWidth + 2',
  "target.dataset.horizontalWheel === 'always'",
  'hasHorizontalIntent(path, index)',
  "scroller.scrollBy({ left: delta, behavior: 'auto' })",
])

const main = read('src/main.ts')
requireTokens(main, 'Application installation', [
  "import { installHorizontalWheelNavigation } from './services/horizontalWheel'",
  'const removeHorizontalWheelNavigation = installHorizontalWheelNavigation()',
  'removeHorizontalWheelNavigation()',
])

const app = read('src/App.vue')
requireTokens(app, 'Compact horizontal surface styling', [
  '[data-horizontal-wheel="always"] {',
  'scrollbar-width: none;',
  '-ms-overflow-style: none;',
  '[data-horizontal-wheel="always"]::-webkit-scrollbar {',
  'display: none;',
])

for (const [file, selector] of [
  ['src/views/TableView.vue', 'class="table-scroll" data-horizontal-wheel="headers"'],
  ['src/views/WorkbookView.vue', 'class="sheet-scroll" data-horizontal-wheel="headers"'],
  ['src/components/workspace/WorkspaceToolbar.vue', 'class="workspace-toolbar-shell" data-horizontal-wheel="always"'],
  ['src/components/workspace/WorkspaceSegmentedControl.vue', 'class="workspace-segmented-control" role="group" data-horizontal-wheel="always"'],
  ['src/views/MindMapView.vue', 'class="mindmap-toolbar" data-horizontal-wheel="always"'],
  ['src/views/CanvasView.vue', 'class="canvas-toolbar" role="toolbar" aria-label="Canvas 工具栏" data-horizontal-wheel="always"'],
  ['src/components/GraphView.vue', 'class="graph-controls" data-horizontal-wheel="always"'],
  ['src/components/GraphView.vue', 'class="graph-options" data-horizontal-wheel="always"'],
  ['src/components/FileRelationContext.vue', 'class="context-filters" aria-label="关系类别" data-horizontal-wheel="always"'],
  ['src/views/TableView.vue', 'class="table-tools" data-horizontal-wheel="always"'],
  ['src/views/WorkbookView.vue', 'class="sheet-tabs" aria-label="工作表" data-horizontal-wheel="always"'],
  ['src/views/WorkbookView.vue', 'class="format-toolbar" :class="{ protected: sheetProtected }" aria-label="单元格格式" data-horizontal-wheel="always"'],
  ['src/views/LogViewerView.vue', 'class="level-filter" role="group" aria-label="日志级别" data-horizontal-wheel="always"'],
  ['src/views/OdfContentReaderView.vue', 'class="sheet-tabs" aria-label="工作表" data-horizontal-wheel="always"'],
  ['src/views/ReleaseCapabilitiesView.vue', 'class="segments" aria-label="能力筛选" data-horizontal-wheel="always"'],
  ['src/views/SettingsView.vue', 'class="theme-library-toolbar" aria-label="主题类型筛选" data-horizontal-wheel="always"'],
  ['src/views/TextEditorView.vue', 'class="format-bar" aria-label="文本保存策略" data-horizontal-wheel="always"'],
]) {
  if (!read(file).includes(selector)) fail(`${file} must expose its dual-axis header scrolling contract`)
}

for (const file of ['src/views/MindMapView.vue', 'src/components/GraphView.vue', 'src/views/WorkbookView.vue']) {
  if (/scrollbar-width\s*:\s*thin/.test(read(file))) fail(`${file} must not restore a native compact-strip scrollbar`)
}

const roots = ['src/components', 'src/views', 'src/styles']
const files = roots.flatMap(root => fs.readdirSync(root, { recursive: true })
  .filter(name => /\.(?:vue|scss|css)$/.test(name))
  .map(name => path.join(root, name)))
const horizontalFiles = files.filter(file => /overflow-x\s*:\s*(?:auto|scroll)|overflow\s*:\s*(?:auto|scroll)/.test(read(file)))
if (horizontalFiles.length < 20) fail(`Horizontal surface audit unexpectedly found only ${horizontalFiles.length} files`)

const evidence = JSON.parse(read('docs/evidence/ux41-horizontal-wheel/runtime-summary.json'))
if (evidence.maxScrollLeft <= 0 || !evidence.forwardWheel?.passed || !evidence.reverseWheel?.passed) {
  fail('Accepted browser runtime evidence must cover forward and reverse vertical-wheel translation')
}

console.log(`Horizontal wheel navigation passed: global delegation covers ${horizontalFiles.length} files, compact control strips hide native tracks, and accepted browser evidence moves ${evidence.maxScrollLeft}px in both directions.`)
