import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync('src/views/MindMapView.vue', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const fail = message => { throw new Error(`UX-37A OPML canvas rejected: ${message}`) }
const evidenceRoot = 'docs/evidence/ux37a-opml-canvas'
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const manifest = readJson(path.join(evidenceRoot, 'manifest.json'))
const evidence = readJson(path.join(evidenceRoot, manifest.evidenceFile))
const capture = fs.readFileSync('scripts/capture-ux37a-opml-canvas.mjs', 'utf8')
const runner = fs.readFileSync('scripts/run-ux37a-opml-canvas-audit.ps1', 'utf8')

for (const token of [
  '<option value="tree">树状</option>',
  '<option value="organization">组织</option>',
  '<option value="radial">放射</option>',
  '<option value="timeline">时间线</option>',
  '<option value="professional">专业</option>',
  '<option value="colorful">多彩</option>',
  '<option value="focus">专注</option>',
  '@pointerdown="startCanvasPointer"',
  '@wheel.prevent="onMapWheel"',
  'startNodePointer($event, item.node.id)',
  'const moveSelectionBox',
  'const moveSelected',
  'selectedIds.value',
  'beginNodeRename',
  'const undo =',
  'const redo =',
  '仅点击保存时写入',
  '请先点击保存，再将当前版本投影到 Canvas',
]) if (!source.includes(token)) fail(`interaction contract missing: ${token}`)

for (const forbidden of [
  'const scheduleSave',
  'setTimeout(() => { void save() }, 1500)',
  'onBeforeRouteLeave(async () => !dirty.value || await save())',
  'if (dirty.value && !(await save()))',
]) if (source.includes(forbidden)) fail(`implicit write path returned: ${forbidden}`)

for (const token of [
  "title: '思维导图还有未保存修改'",
  "content: '离开后会丢失当前草稿，源文件不会被修改。'",
  'onBeforeRouteLeave(() => mayLeave())',
  'onBeforeRouteUpdate((to, from) => to.query.path === from.query.path || mayLeave())',
  "document.value.metadata._longeditLayout = layoutMode.value",
  "node.attributes._longeditX",
  "node.attributes._longeditY",
]) if (!source.includes(token)) fail(`draft or persistence contract missing: ${token}`)

if (!packageJson.scripts?.['check:ux37a-opml-canvas']) fail('package command missing')
if (!packageJson.scripts?.['audit:ux37a-opml-canvas']) fail('desktop audit command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux37a-opml-canvas-contract')) fail('checker is not in the development audit chain')

if (manifest.schemaVersion !== 1 || manifest.stage !== 'UX-37A' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('manifest identity or visual review drift')
if (manifest.productSourceCommit !== 'a6975600f7d3bceac3e920c2eb1724c8454bac88' || evidence.sourceCommit !== manifest.productSourceCommit) fail('product source commit drift')
if (manifest.sourceUserContentIncluded !== false || manifest.releaseCandidate !== false) fail('privacy or release boundary drift')
if (sha256(path.join(evidenceRoot, manifest.evidenceFile)) !== manifest.evidenceSha256) fail('evidence hash drift')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 3) fail('screenshot manifest drift')
for (const screenshot of manifest.screenshots) {
  const file = path.join(evidenceRoot, screenshot.file)
  if (fs.statSync(file).size !== screenshot.bytes || screenshot.bytes < 100_000 || sha256(file) !== screenshot.sha256) fail(`screenshot integrity drift: ${screenshot.file}`)
}
if (evidence.layoutOptionCount !== 4 || evidence.themeOptionCount !== 3 || evidence.zoomChanged !== true) fail('layout, theme, or zoom evidence drift')
if (evidence.selectedCount !== 2 || evidence.multiNodeDragChanged !== true || evidence.keyboardMoveObserved !== true || evidence.directRenameVisible !== true) fail('selection, movement, or rename evidence drift')
if (evidence.dirtyDraftVisible !== true || evidence.sourceSignatureUnchangedWithoutSave !== true) fail('explicit-save evidence drift')
if (evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false || evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('runtime, privacy, or release evidence drift')
if (/([A-Za-z]:\\Users\\|\\\\\?\\[A-Za-z]:)/.test(JSON.stringify(evidence))) fail('evidence contains an unredacted local path')
for (const token of ['multiNodeDragChanged', 'keyboardMoveObserved', 'sourceSignatureUnchangedWithoutSave', 'multi-select-dragged.jpg']) if (!capture.includes(token)) fail(`capture token missing: ${token}`)
for (const token of ['LONGEDIT_E2E_LIBRARY', 'UX37 Product Mind Map.opml', 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', '$appPort = 14200']) if (!runner.includes(token)) fail(`runner token missing: ${token}`)

console.log('UX-37A OPML canvas contract passed: four layouts, three themes, pan/zoom, box and multi-selection, free dragging, keyboard movement, direct rename, undo/redo, and explicit-save-only behavior are present.')
