import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(`UX-38D3 presentation workspace rejected: ${message}`); process.exit(1) }
const pptx = read('src/views/PptxReaderView.vue')
const odf = read('src/views/OdfContentReaderView.vue')
for (const token of ['ref="stageRef" class="pptx-stage"', 'rememberPptxViewState()', 'recallWorkspaceViewState(pptxPath.value)', 'container-type: inline-size', '@container (max-width: 760px)']) {
  if (!pptx.includes(token)) fail(`PPTX product token missing: ${token}`)
}
for (const token of ['rememberOdfViewState()', 'recallWorkspaceViewState(documentPath.value)', "format === 'ods'", 'container-type: inline-size', '@container (max-width: 700px)']) {
  if (!odf.includes(token)) fail(`ODP product token missing: ${token}`)
}
const registry = JSON.parse(read('shared/file-formats.json'))
const pptxFormat = registry.formats.find(format => format.id === 'pptx')
const odpFormat = registry.formats.find(format => format.id === 'odp')
if (pptxFormat?.userCapability?.saveMode !== 'copy' || pptxFormat.userCapability.label !== '基础编辑副本') fail('PPTX reliable-copy boundary drift')
if (odpFormat?.userCapability?.saveMode !== 'none' || odpFormat.capabilities?.edit !== 'unsupported') fail('ODP read-only boundary drift')

const root = 'docs/evidence/ux38d3-presentation-workspace'
const manifestPath = path.join(root, 'manifest.json')
const evidencePath = path.join(root, 'interaction-evidence.json')
const manifest = JSON.parse(read(manifestPath))
const evidence = JSON.parse(read(evidencePath))
if (manifest.stage !== 'UX-38D3' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('visual evidence is not accepted')
if (manifest.sourceCommit !== evidence.sourceCommit || evidence.sourceCommit !== '943e084d35a1b8b01a303fe7256220289a46016f') fail('evidence is not bound to the accepted product commit')
for (const key of ['pptxLoaded', 'odpLoaded', 'pptxContextRestored', 'odpContextRestored', 'pptxCopyOnlyBoundary', 'odpReadonlyBoundary', 'pptxNarrowStable', 'odpNarrowStable', 'sourceFilesUnchanged']) {
  if (evidence[key] !== true) fail(`evidence gate failed: ${key}`)
}
if (evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false || evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('runtime/privacy/release boundary drift')
if (manifest.evidenceSha256 !== crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')) fail('evidence digest mismatch')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 3) fail('screenshot set is incomplete')
for (const screenshot of manifest.screenshots) {
  const file = path.join(root, screenshot.file)
  const bytes = fs.readFileSync(file)
  if (bytes.length !== screenshot.bytes || bytes.length < 60_000 || crypto.createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) fail(`screenshot identity failed: ${screenshot.file}`)
}
const matrix = JSON.parse(read('shared/ux38-format-experience-matrix.json'))
if (matrix.formats.find(format => format.id === 'pptx')?.profile !== 'ux38d3-pptx') fail('PPTX experience profile drift')
if (matrix.formats.find(format => format.id === 'odp')?.profile !== 'ux38d3-odp') fail('ODP experience profile drift')
const packageJson = JSON.parse(read('package.json'))
if (!packageJson.scripts?.['audit:ux38d3-presentation-workspace'] || !packageJson.scripts?.['check:ux38d3-presentation-workspace']) fail('package audit/check command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38d3-presentation-workspace')) fail('checker is outside the development audit chain')
console.log('UX-38D3 presentation workspace contract passed: PPTX has reliable-copy editing and restored context; ODP remains read-only with restored context.')
