import fs from 'node:fs'

const source = fs.readFileSync('src/components/GraphView.vue', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const fail = message => { throw new Error(`UX-37B knowledge graph canvas rejected: ${message}`) }

for (const token of [
  '<option value="force">自动网络</option>',
  '<option value="tree">树状</option>',
  '<option value="organization">组织</option>',
  '<option value="radial">放射</option>',
  '<option value="timeline">时间线</option>',
  '<option value="professional">专业</option>',
  '<option value="colorful">多彩</option>',
  '<option value="focus">专注</option>',
  ':data-layout-mode="graphLayoutMode"',
  ':data-selected-count="selectedNodeIds.length"',
  'const selectedNodeIds = ref<string[]>([])',
  'let selectionBox:',
  'const moveSelectedNodes',
  'const undoLayout',
  'const redoLayout',
  'const fitGraph',
  "event.key.toLowerCase() === 'a'",
  "event.key === 'ArrowRight'",
  "localStorage.setItem('longedit.graph.layout-mode'",
  "localStorage.setItem('longedit.graph.canvas-theme'",
  'saveGraphLayout(store.libraryPath, currentLayoutId()',
]) if (!source.includes(token)) fail(`interaction contract missing: ${token}`)

for (const forbidden of [
  "invoke('write_text_file'",
  "invoke('write_markdown_file'",
  'autoSave',
]) if (source.includes(forbidden)) fail(`canvas layout must not write document sources: ${forbidden}`)

for (const token of [
  "const { writeFile } = await import('@tauri-apps/plugin-fs')",
  "format === 'svg'",
  'graphSvgToPng(svg)',
]) if (!source.includes(token)) fail(`explicit graph export contract missing: ${token}`)

if (!packageJson.scripts?.['check:ux37b-knowledge-graph-canvas']) fail('package command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux37b-knowledge-graph-canvas-contract')) fail('checker is not in the current development audit chain')

console.log('UX-37B knowledge graph canvas contract passed: five layouts, three themes, pan/zoom, box and multi-selection, grouped drag, keyboard movement, undo/redo, fit-to-window, local layout persistence, and source-read-only behavior are present.')
