import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const failures = []
const tokens = read('src/styles/tokens.scss')
const table = read('src/views/TableView.vue')
const requiredViews = [
  'src/views/TableView.vue',
  'src/views/WorkbookView.vue',
  'src/views/CanvasView.vue',
  'src/views/MindMapView.vue',
  'src/views/DiagramStudio.vue',
  'src/views/PdfView.vue',
  'src/views/PptxReaderView.vue',
  'src/views/DocxReaderView.vue',
  'src/views/OdtReaderView.vue',
  'src/views/LogViewerView.vue',
  'src/views/YamlEditorView.vue',
]

for (const token of [
  '[data-command-strip]',
  'overflow-x: auto',
  'scrollbar-width: none',
  '[data-command-strip] > *',
  'flex-shrink: 0',
  'white-space: nowrap',
]) {
  if (!tokens.includes(token)) failures.push(`shared command strip rule missing: ${token}`)
}

for (const path of requiredViews) {
  if (!read(path).includes('data-command-strip')) failures.push(`command strip marker missing: ${path}`)
}

for (const token of [
  'class="table-tools" data-command-strip data-horizontal-wheel="always"',
  'min-width: max-content',
  '.table-tools { min-width: 0; max-width: 100%',
]) {
  if (!table.includes(token)) failures.push(`Table toolbar overflow protection missing: ${token}`)
}
if (table.includes('.table-tools > button:not(.save-button):not(.history-button) { display: none; }')) {
  failures.push('Table commands must remain reachable instead of disappearing at narrow widths')
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log(`Command strip layout passed: ${requiredViews.length} workspaces keep controls readable, scrollable and reachable.`)
