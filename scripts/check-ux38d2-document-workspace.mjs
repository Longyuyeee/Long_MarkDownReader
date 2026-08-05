import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(`UX-38D2 document workspace rejected: ${message}`); process.exit(1) }
const docx = read('src/views/DocxReaderView.vue')
const odt = read('src/views/OdtReaderView.vue')
for (const token of ['ref="stageRef" class="docx-stage"', 'rememberDocxViewState()', 'recallWorkspaceViewState(docxPath.value)', 'container-type: inline-size', '@container (max-width: 680px)']) {
  if (!docx.includes(token)) fail(`DOCX product token missing: ${token}`)
}
for (const token of ['ref="stageRef" class="odt-stage"', 'rememberOdtViewState()', 'recallWorkspaceViewState(odtPath.value)', 'container-type: inline-size', '@container (max-width: 560px)']) {
  if (!odt.includes(token)) fail(`ODT product token missing: ${token}`)
}

const registry = JSON.parse(read('shared/file-formats.json'))
const docxFormat = registry.formats.find(format => format.id === 'docx')
if (docxFormat?.userCapability?.saveMode !== 'bounded-overwrite' || docxFormat.userCapability.label !== '受限页面编辑') fail('DOCX registry save boundary drift')
if (registry.formats.some(format => format.id === 'odt' || format.extensions?.includes('.odt'))) fail('ODT was registered before its 3/3 producer gate')
const release = JSON.parse(read('shared/release-capability-matrix.json'))
const odtGate = release.externalGates?.find(gate => gate.id === 'e1b-wps-odt')
if (odtGate?.status !== 'partial' || odtGate.evidence !== '2/3') fail('ODT external producer gate drift')

const root = 'docs/evidence/ux38d2-document-workspace'
const manifestPath = path.join(root, 'manifest.json')
const evidencePath = path.join(root, 'interaction-evidence.json')
const manifest = JSON.parse(read(manifestPath))
const evidence = JSON.parse(read(evidencePath))
if (manifest.stage !== 'UX-38D2' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('visual evidence is not accepted')
if (manifest.sourceCommit !== evidence.sourceCommit || evidence.sourceCommit !== '5883c3685d1ee49ee9fec06005cca7a6553a10a9') fail('evidence is not bound to the accepted product commit')
for (const key of ['docxLoaded', 'odtLoaded', 'docxContextRestored', 'odtDirectRouteContextRestored', 'docxExplicitSaveBoundary', 'odtReadonlyBoundary', 'docxNarrowStable', 'odtNarrowStable', 'sourceFilesUnchanged']) {
  if (evidence[key] !== true) fail(`evidence gate failed: ${key}`)
}
if (evidence.odtManagedRegistration !== false || evidence.odtProducerGate !== '2/3') fail('ODT exposure boundary drift')
if (evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false || evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('runtime/privacy/release boundary drift')
if (manifest.evidenceSha256 !== crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')) fail('evidence digest mismatch')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 3) fail('screenshot set is incomplete')
for (const screenshot of manifest.screenshots) {
  const file = path.join(root, screenshot.file)
  const bytes = fs.readFileSync(file)
  if (bytes.length !== screenshot.bytes || bytes.length < 60_000 || crypto.createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) fail(`screenshot identity failed: ${screenshot.file}`)
}
const packageJson = JSON.parse(read('package.json'))
if (!packageJson.scripts?.['audit:ux38d2-document-workspace'] || !packageJson.scripts?.['check:ux38d2-document-workspace']) fail('package audit/check command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38d2-document-workspace')) fail('checker is outside the development audit chain')
console.log('UX-38D2 document workspace contract passed: DOCX is accepted with bounded explicit save and restored context; ODT remains an accepted direct preview behind its 2/3 registration gate.')
