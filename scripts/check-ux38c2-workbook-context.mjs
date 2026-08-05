import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const workbook = read('src/views/WorkbookView.vue')
const ods = read('src/views/OdfContentReaderView.vue')
const table = read('src/views/TableView.vue')
for (const token of ['container-type: inline-size', '@container (max-width: 900px)', 'rememberWorkspaceViewState(workbookPath.value', '.workbook-cell.frozen.in-table', '.workbook-cell.frozen.fill-preview']) {
  if (!workbook.includes(token)) fail(`UX-38C2 workbook token missing: ${token}`)
}
for (const token of ['ref="sheetStageRef"', 'rememberOdsViewState', 'recallWorkspaceViewState(documentPath.value)', '@container (max-width: 700px)', '.sheet-stage .corner { z-index: 4; }']) {
  if (!ods.includes(token)) fail(`UX-38C2 ODS token missing: ${token}`)
}
for (const token of ['loading.value = false', 'rememberWorkspaceViewState(tablePath.value', 'scrollLeft: scrollRef.value.scrollLeft']) {
  if (!table.includes(token)) fail(`UX-38C2 table return token missing: ${token}`)
}
const manifestPath = 'docs/evidence/ux38c2-workbook-context/manifest.json'
const evidencePath = 'docs/evidence/ux38c2-workbook-context/interaction-evidence.json'
if (!fs.existsSync(manifestPath) || !fs.existsSync(evidencePath)) fail('UX-38C2 accepted desktop evidence is missing')
const manifest = JSON.parse(read(manifestPath))
const evidence = JSON.parse(read(evidencePath))
if (manifest.stage !== 'UX-38C2' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('UX-38C2 visual evidence is not accepted')
if (manifest.sourceCommit !== evidence.sourceCommit || !/^[0-9a-f]{40}$/i.test(evidence.sourceCommit)) fail('UX-38C2 product commit binding is invalid')
if (evidence.sourceCommit !== '89d1dffc4d23871e16f1c6bee9a99c6507a4393d') fail('UX-38C2 evidence is not bound to the accepted product commit')
for (const key of ['workbookLoaded', 'odsLoaded', 'workbookFrozenLayersOpaque', 'workbookFrozenPositionsStable', 'workbookContextRestored', 'csvContextRestored', 'tsvContextRestored', 'odsContextRestored', 'odsFrozenLayersOpaque', 'odsNarrowStable', 'sourceFilesUnchanged']) {
  if (evidence[key] !== true) fail(`UX-38C2 evidence gate failed: ${key}`)
}
if (evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false || evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('UX-38C2 runtime/privacy/release boundary drift')
const evidenceDigest = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')
if (manifest.evidenceSha256 !== evidenceDigest) fail('UX-38C2 evidence digest mismatch')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 3) fail('UX-38C2 screenshot set is incomplete')
for (const screenshot of manifest.screenshots) {
  const file = path.join('docs/evidence/ux38c2-workbook-context', screenshot.file)
  if (!fs.existsSync(file)) fail(`UX-38C2 screenshot missing: ${screenshot.file}`)
  const bytes = fs.readFileSync(file)
  if (bytes.length !== screenshot.bytes || bytes.length < 60_000 || crypto.createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) fail(`UX-38C2 screenshot identity failed: ${screenshot.file}`)
}
console.log('UX-38C2 workbook/ODS context contract passed with accepted real desktop evidence.')
