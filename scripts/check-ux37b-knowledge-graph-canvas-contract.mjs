import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { textEvidenceMatchesSha256 } from './lib/text-evidence-integrity.mjs'

const source = fs.readFileSync('src/components/GraphView.vue', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const fail = message => { throw new Error(`UX-37B knowledge graph canvas rejected: ${message}`) }
const evidenceRoot = 'docs/evidence/ux37b-knowledge-graph-canvas'
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const manifest = readJson(path.join(evidenceRoot, 'manifest.json'))
const evidence = readJson(path.join(evidenceRoot, manifest.evidenceFile))
const capture = fs.readFileSync('scripts/capture-ux37b-knowledge-graph-canvas.mjs', 'utf8')
const runner = fs.readFileSync('scripts/run-ux37b-knowledge-graph-canvas-audit.ps1', 'utf8')

for (const token of [
  "{ label: '自动网络', value: 'force' }",
  "{ label: '树状层级', value: 'tree' }",
  "{ label: '组织结构', value: 'organization' }",
  "{ label: '放射聚焦', value: 'radial' }",
  "{ label: '时间线', value: 'timeline' }",
  "{ label: '专业 · 克制网格', value: 'professional' }",
  "{ label: '多彩 · 语义光域', value: 'colorful' }",
  "{ label: '专注 · 纯净画布', value: 'focus' }",
  '<n-select class="graph-option-select graph-layout-select"',
  '<n-select class="graph-option-select graph-theme-select"',
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
  'createGraphPng(visibleNodes.value, visibleEdges.value, exportOptions)',
]) if (!source.includes(token)) fail(`explicit graph export contract missing: ${token}`)

if (!packageJson.scripts?.['check:ux37b-knowledge-graph-canvas']) fail('package command missing')
if (!packageJson.scripts?.['audit:ux37b-knowledge-graph-canvas']) fail('desktop audit command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux37b-knowledge-graph-canvas-contract')) fail('checker is not in the current development audit chain')

if (manifest.schemaVersion !== 1 || manifest.stage !== 'UX-37B' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('manifest identity or visual review drift')
if (manifest.productSourceCommit !== '17ad313fdf467c857856ffa6698b549315bb8f43' || evidence.sourceCommit !== manifest.productSourceCommit) fail('product source commit drift')
if (manifest.sourceUserContentIncluded !== false || manifest.releaseCandidate !== false) fail('privacy or release boundary drift')
if (!textEvidenceMatchesSha256(path.join(evidenceRoot, manifest.evidenceFile), manifest.evidenceSha256)) fail('evidence hash drift')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 3) fail('screenshot manifest drift')
for (const screenshot of manifest.screenshots) {
  const file = path.join(evidenceRoot, screenshot.file)
  if (fs.statSync(file).size !== screenshot.bytes || screenshot.bytes < 70_000 || sha256(file) !== screenshot.sha256) fail(`screenshot integrity drift: ${screenshot.file}`)
}
if (evidence.nodeCount !== 6 || evidence.layoutOptionCount !== 5 || evidence.themeOptionCount !== 3 || evidence.radialLayoutObserved !== true) fail('graph, layout, or theme evidence drift')
if (evidence.zoomChanged !== true || evidence.boxSelectedCount !== 6 || evidence.groupedDragPreservedSelection !== true || evidence.groupedDragChanged !== true) fail('zoom, selection, or grouped drag evidence drift')
if (evidence.keyboardMoveObserved !== true || evidence.undoControlObserved !== true || evidence.redoControlObserved !== true) fail('keyboard or history evidence drift')
if (evidence.sourceFilesUnchanged !== true || evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false) fail('source, runtime, or blocking surface evidence drift')
if (evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('evidence privacy or release boundary drift')
if (/([A-Za-z]:\\Users\\|\\\\\?\\[A-Za-z]:)/.test(JSON.stringify(evidence))) fail('evidence contains an unredacted local path')
for (const token of ['boxSelectedCount', 'groupedDragChanged', 'keyboardMoveObserved', 'multi-selection-moved.jpg']) if (!capture.includes(token)) fail(`capture token missing: ${token}`)
for (const token of ['LONGEDIT_E2E_LIBRARY', 'Product.md', 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', '$appPort = 14200', 'sourceFilesUnchanged']) if (!runner.includes(token)) fail(`runner token missing: ${token}`)

console.log('UX-37B knowledge graph canvas contract passed: five layouts, three themes, pan/zoom, box and multi-selection, grouped drag, keyboard movement, undo/redo, fit-to-window, local layout persistence, and source-read-only behavior are present.')
