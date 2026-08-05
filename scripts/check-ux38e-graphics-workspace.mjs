import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(`UX-38E graphics workspace rejected: ${message}`); process.exit(1) }
const productFiles = {
  canvas: read('src/views/CanvasView.vue'),
  drawio: read('src/views/DrawioEditorView.vue'),
  diagram: read('src/views/DiagramStudio.vue'),
  opml: read('src/views/MindMapView.vue'),
}
for (const [name, source] of Object.entries(productFiles)) {
  for (const token of ['recallWorkspaceViewState', 'rememberWorkspaceViewState', 'loading.value) return']) if (!source.includes(token)) fail(`${name} context token missing: ${token}`)
}
for (const token of ["['dirty', 'error'].includes(saveState.value)", 'onBeforeRouteLeave', 'beforeunload']) if (!productFiles.canvas.includes(token)) fail(`Canvas explicit-save token missing: ${token}`)
for (const token of ['undoStack', 'redoStack', 'restoreDrawioViewState', 'write_drawio_source_document']) if (!productFiles.drawio.includes(token)) fail(`Drawio history token missing: ${token}`)
for (const token of ['undoStack', 'redoStack', 'rememberDiagramViewState', 'write_diagram_file']) if (!productFiles.diagram.includes(token)) fail(`Mermaid history token missing: ${token}`)
for (const token of ['undoStack', 'redoStack', 'rememberMindMapViewState', 'write_opml_file']) if (!productFiles.opml.includes(token)) fail(`OPML token missing: ${token}`)

const root = 'docs/evidence/ux38e-graphics-workspace'
const manifestPath = path.join(root, 'manifest.json')
const evidencePath = path.join(root, 'interaction-evidence.json')
const manifest = JSON.parse(read(manifestPath))
const evidence = JSON.parse(read(evidencePath))
if (manifest.stage !== 'UX-38E' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('visual evidence is not accepted')
if (manifest.sourceCommit !== evidence.sourceCommit || evidence.sourceCommit !== 'b45574cdc8f6304bb98b4fef492479a5354c06c3') fail('evidence is not bound to the accepted product commit')
for (const format of ['canvas', 'drawio', 'diagram']) {
  for (const suffix of ['NoWriteBeforeSave', 'UndoRedo', 'ExplicitSaveWrites', 'ContextRestored', 'NarrowStable']) {
    if (evidence[`${format}${suffix}`] !== true) fail(`evidence gate failed: ${format}${suffix}`)
  }
}
for (const suffix of ['NoWriteBeforeSave', 'ExplicitSaveWrites', 'ContextRestored', 'NarrowStable']) if (evidence[`opml${suffix}`] !== true) fail(`evidence gate failed: opml${suffix}`)
if (evidence.opmlHistoryReferenced !== 'docs/evidence/ux37a-opml-canvas/manifest.json') fail('OPML history evidence reference drift')
if (evidence.runtimeErrorCount !== 0 || evidence.unexpectedDialogCount !== 0 || evidence.blockingErrorSurfaceObserved !== false || evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('runtime/dialog/privacy/release boundary drift')
if (manifest.evidenceSha256 !== crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')) fail('evidence digest mismatch')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 4) fail('screenshot set is incomplete')
for (const screenshot of manifest.screenshots) {
  const bytes = fs.readFileSync(path.join(root, screenshot.file))
  if (bytes.length !== screenshot.bytes || bytes.length < 40_000 || crypto.createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) fail(`screenshot identity failed: ${screenshot.file}`)
}
const matrix = JSON.parse(read('shared/ux38-format-experience-matrix.json'))
for (const format of ['canvas', 'drawio', 'diagram', 'opml']) if (matrix.formats.find(item => item.id === format)?.profile !== 'ux38e-graphics') fail(`${format} experience profile drift`)
const packageJson = JSON.parse(read('package.json'))
if (!packageJson.scripts?.['audit:ux38e-graphics-workspace'] || !packageJson.scripts?.['check:ux38e-graphics-workspace']) fail('package audit/check command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38e-graphics-workspace')) fail('checker is outside the development audit chain')
console.log('UX-38E graphics workspace contract passed: four graphics formats use explicit saves, document history, restored context, and stable narrow layouts.')
