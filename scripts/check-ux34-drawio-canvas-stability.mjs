import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { textEvidenceMatchesSha256 } from './lib/text-evidence-integrity.mjs'

const read = file => fs.readFileSync(file)
const text = file => read(file).toString('utf8')
const json = file => JSON.parse(text(file))
const sha256 = file => crypto.createHash('sha256').update(read(file)).digest('hex')
const fail = message => { throw new Error(`UX-34 Drawio/Canvas stability rejected: ${message}`) }
const root = 'docs/evidence/ux34-drawio-canvas-stability'
const packageJson = json('package.json')
const manifest = json(path.join(root, 'manifest.json'))
const evidence = json(path.join(root, manifest.evidenceFile))
const index = text('index.html')
const main = text('src/main.ts')
const runtimeBoundary = text('src/services/recoverableRuntimeErrors.ts')
const canvas = text('src/views/CanvasView.vue')
const capture = text('scripts/capture-ux34-drawio-canvas-stability.mjs')
const runner = text('scripts/run-ux34-drawio-canvas-stability-audit.ps1')

if (manifest.schemaVersion !== 1 || manifest.stage !== 'UX-34' || manifest.status !== 'accepted') fail('manifest identity drift')
if (manifest.productSourceCommit !== '2f756cd1d9bb729a0002077d20aa6d0060bf961b' || evidence.sourceCommit !== manifest.productSourceCommit) fail('product source commit drift')
if (manifest.visualReview !== 'accepted' || manifest.sourceUserContentIncluded !== false || manifest.releaseCandidate !== false) fail('visual, privacy, or release boundary drift')
if (!textEvidenceMatchesSha256(path.join(root, manifest.evidenceFile), manifest.evidenceSha256)) fail('evidence hash drift')
const screenshot = path.join(root, manifest.screenshotFile)
if (fs.statSync(screenshot).size !== manifest.screenshotBytes || manifest.screenshotBytes < 100000 || sha256(screenshot) !== manifest.screenshotSha256) fail('screenshot integrity drift')

for (const source of [index, runtimeBoundary]) {
  for (const token of ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications.']) {
    if (!source.includes(token)) fail(`recoverable message missing: ${token}`)
  }
}
for (const token of ['if (isRecoverableLayoutError(msg) || isRecoverableLayoutError(err)) return true', "document.getElementById('crash-screen').style.display = 'block'"]) {
  if (!index.includes(token)) fail(`startup error boundary missing: ${token}`)
}
for (const token of ['installRecoverableLayoutErrorBoundary()', 'import.meta.hot?.dispose']) if (!main.includes(token)) fail(`runtime boundary installation missing: ${token}`)
for (const token of ["target.addEventListener('error', handleError, true)", 'event.preventDefault()', "target.removeEventListener('error', handleError, true)"]) if (!runtimeBoundary.includes(token)) fail(`runtime recovery token missing: ${token}`)
for (const token of ['requestAnimationFrame(() =>', 'next.width === viewportSize.width && next.height === viewportSize.height', 'viewportResizeObserver?.disconnect()', 'cancelAnimationFrame(viewportResizeFrame)', 'pendingViewportSize = null']) if (!canvas.includes(token)) fail(`Canvas resize lifecycle missing: ${token}`)

if (evidence.schemaVersion !== 1 || evidence.stage !== 'UX-34' || evidence.routeCycles !== 6 || evidence.viewportChanges !== 6 || evidence.canvasZoomInteractions !== 6 || evidence.canvasDragInteractions !== 6) fail('stress interaction counts drift')
if (evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false || evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('runtime, privacy, or release evidence drift')
const boundary = evidence.boundary || {}
if (!boundary.undeliveredPrevented || boundary.undeliveredDisplayed || !boundary.limitPrevented || boundary.limitDisplayed || boundary.unrelatedPrevented || !boundary.unrelatedDisplayed) fail('recoverable/non-recoverable boundary drift')
if (evidence.cycles?.length !== 6) fail('route cycle evidence missing')
for (const cycle of evidence.cycles) {
  if (cycle.drawio?.pages < 1 || cycle.drawio?.cells < 1 || cycle.drawio?.errorVisible || cycle.canvas?.nodes < 1 || !cycle.canvas?.worldTransform?.includes('scale(') || cycle.canvas?.crashFallbackVisible) fail(`cycle ${cycle.cycle} drift`)
}
for (const token of ['Runtime.exceptionThrown', 'Log.entryAdded', 'unrelatedDisplayed', "document.querySelector('#crash-screen')", 'canvasDragInteractions: 6']) if (!capture.includes(token)) fail(`desktop capture token missing: ${token}`)
for (const token of ['LONGEDIT_E2E_LIBRARY', 'valid.canvas', 'drawio-uncompressed.drawio', 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS']) if (!runner.includes(token)) fail(`desktop runner token missing: ${token}`)
if (!packageJson.scripts?.['audit:ux34-drawio-canvas-stability'] || !packageJson.scripts?.['check:ux34-drawio-canvas-stability']) fail('package commands missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux34-drawio-canvas-stability')) fail('UX-34 checker is not in the development audit chain')

console.log('UX-34 Drawio/Canvas stability passed: recoverable layout notifications stay non-blocking while unrelated errors remain visible across six Tauri WebView route cycles.')
