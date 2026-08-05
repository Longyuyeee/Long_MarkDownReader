import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(`UX-38D1 PDF workspace rejected: ${message}`); process.exit(1) }
const pdf = read('src/views/PdfView.vue')
for (const token of ['recallWorkspaceViewState(pdfPath.value)', 'rememberPdfViewState()', '@container (max-width: 980px)', '@container (max-width: 760px)', 'grid-template-columns: repeat(3,minmax(0,1fr))']) {
  if (!pdf.includes(token)) fail(`product token missing: ${token}`)
}

const root = 'docs/evidence/ux38d1-pdf-workspace'
const manifestPath = path.join(root, 'manifest.json')
const evidencePath = path.join(root, 'interaction-evidence.json')
if (!fs.existsSync(manifestPath) || !fs.existsSync(evidencePath)) fail('accepted desktop evidence is missing')
const manifest = JSON.parse(read(manifestPath))
const evidence = JSON.parse(read(evidencePath))
if (manifest.stage !== 'UX-38D1' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('visual evidence is not accepted')
if (manifest.sourceCommit !== evidence.sourceCommit || evidence.sourceCommit !== '2e26847e8afe9dcd6bb69fdd74884daecf412624') fail('evidence is not bound to the accepted product commit')
for (const key of ['pdfLoaded', 'pdfContextRestored', 'narrowWorkspaceStable', 'narrowToolbarWrapped', 'sourceFileUnchanged']) {
  if (evidence[key] !== true) fail(`evidence gate failed: ${key}`)
}
if (evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false || evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('runtime/privacy/release boundary drift')
const digest = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')
if (manifest.evidenceSha256 !== digest) fail('evidence digest mismatch')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 3) fail('screenshot set is incomplete')
for (const screenshot of manifest.screenshots) {
  const file = path.join(root, screenshot.file)
  if (!fs.existsSync(file)) fail(`screenshot missing: ${screenshot.file}`)
  const bytes = fs.readFileSync(file)
  if (bytes.length !== screenshot.bytes || bytes.length < 50_000 || crypto.createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) fail(`screenshot identity failed: ${screenshot.file}`)
}
const packageJson = JSON.parse(read('package.json'))
if (!packageJson.scripts?.['audit:ux38d1-pdf-workspace'] || !packageJson.scripts?.['check:ux38d1-pdf-workspace']) fail('package audit/check command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38d1-pdf-workspace')) fail('checker is outside the development audit chain')
console.log('UX-38D1 PDF workspace contract passed with accepted real Tauri context, narrow-layout, runtime, and source-integrity evidence.')
