import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file)
const text = file => read(file).toString('utf8')
const json = file => JSON.parse(text(file))
const sha256 = file => crypto.createHash('sha256').update(read(file)).digest('hex')
const fail = message => { throw new Error(`UX-35 file-tree preview rejected: ${message}`) }
const root = 'docs/evidence/ux35-file-tree-preview'
const packageJson = json('package.json')
const manifest = json(path.join(root, 'manifest.json'))
const evidence = json(path.join(root, manifest.evidenceFile))
const library = text('src/views/LibraryMode.vue')
const preview = text('src/components/HoverPreview.vue')
const capture = text('scripts/capture-ux35-file-tree-preview.mjs')
const runner = text('scripts/run-ux35-file-tree-preview-audit.ps1')

if (manifest.schemaVersion !== 1 || manifest.stage !== 'UX-35' || manifest.status !== 'accepted') fail('manifest identity drift')
if (manifest.productSourceCommit !== 'b3bf7f1671cfaa766a78ed983171d01a51123b08' || evidence.sourceCommit !== manifest.productSourceCommit) fail('product source commit drift')
if (manifest.visualReview !== 'accepted' || manifest.sourceUserContentIncluded !== false || manifest.releaseCandidate !== false) fail('visual, privacy, or release boundary drift')
if (sha256(path.join(root, manifest.evidenceFile)) !== manifest.evidenceSha256) fail('evidence hash drift')
for (const [fileKey, bytesKey, hashKey] of [
  ['mouseScreenshotFile', 'mouseScreenshotBytes', 'mouseScreenshotSha256'],
  ['keyboardScreenshotFile', 'keyboardScreenshotBytes', 'keyboardScreenshotSha256'],
]) {
  const file = path.join(root, manifest[fileKey])
  if (fs.statSync(file).size !== manifest[bytesKey] || manifest[bytesKey] < 50000 || sha256(file) !== manifest[hashKey]) fail(`${fileKey} integrity drift`)
}

if (library.includes("'title': option.label")) fail('duplicate native title returned')
for (const token of [
  'class="library-file-tree"',
  `:aria-describedby="preview.focusPath ? 'file-tree-detail-preview' : undefined"`,
  "'.n-tree-node--pending[data-drop-path]'",
  "pending?.dataset.dropPath",
  "if (event.key === 'Escape')",
  "'aria-describedby': option.isLeaf ? 'file-tree-detail-preview' : undefined",
  'scheduleFilePreview(option, e.clientX, e.clientY, 600)',
]) if (!library.includes(token)) fail(`file-tree interaction token missing: ${token}`)
for (const token of ['id="file-tree-detail-preview"', 'role="tooltip"']) if (!preview.includes(token)) fail(`tooltip semantic token missing: ${token}`)

if (evidence.schemaVersion !== 1 || evidence.stage !== 'UX-35') fail('evidence identity drift')
if (evidence.baseline?.leafCount !== 2 || evidence.baseline?.nativeTitleCount !== 0 || evidence.baseline?.describedLeafCount !== 2) fail('file-tree baseline drift')
if (!evidence.mousePreview?.visible || !evidence.mousePreview?.title || !evidence.mousePreview?.path || evidence.mousePreview?.statCount < 2) fail('mouse preview evidence drift')
if (!evidence.keyboardPreview?.activeElementIsTree || !evidence.keyboardPreview?.pendingFile || evidence.keyboardPreview?.treeDescription !== 'file-tree-detail-preview' || !evidence.keyboardPreview?.visible) fail('keyboard preview evidence drift')
if (evidence.escapeDismissed !== true || evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false || evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('dismissal, runtime, privacy, or release evidence drift')
if (/([A-Za-z]:\\\\Users\\\\|\\\\\\\\\?\\\\[A-Za-z]:)/.test(JSON.stringify(evidence))) fail('evidence contains an unredacted local path')

for (const token of ['Runtime.exceptionThrown', 'nativeTitleCount', 'keyboardDiagnostic', "key: 'Escape'", 'sourceUserContentIncluded: false']) if (!capture.includes(token)) fail(`desktop capture token missing: ${token}`)
for (const token of ['LONGEDIT_E2E_LIBRARY', 'README.md', 'valid.canvas', 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS']) if (!runner.includes(token)) fail(`desktop runner token missing: ${token}`)
if (!packageJson.scripts?.['audit:ux35-file-tree-preview'] || !packageJson.scripts?.['check:ux35-file-tree-preview']) fail('package commands missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux35-file-tree-preview')) fail('UX-35 checker is not in the development audit chain')

console.log('UX-35 file-tree preview passed: mouse and keyboard share one accessible detail tooltip, native titles are absent, and Escape dismisses cleanly in Tauri WebView2.')
