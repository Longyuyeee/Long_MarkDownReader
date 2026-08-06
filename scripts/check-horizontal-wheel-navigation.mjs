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

for (const [file, selector] of [
  ['src/views/TableView.vue', 'class="table-scroll" data-horizontal-wheel="headers"'],
  ['src/views/WorkbookView.vue', 'class="sheet-scroll" data-horizontal-wheel="headers"'],
  ['src/components/workspace/WorkspaceToolbar.vue', 'class="workspace-toolbar-shell" data-horizontal-wheel="always"'],
  ['src/components/workspace/WorkspaceSegmentedControl.vue', 'class="workspace-segmented-control" role="group" data-horizontal-wheel="always"'],
]) {
  if (!read(file).includes(selector)) fail(`${file} must expose its dual-axis header scrolling contract`)
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

console.log(`Horizontal wheel navigation passed: global delegation covers ${horizontalFiles.length} files and accepted browser evidence moves ${evidence.maxScrollLeft}px in both directions.`)
