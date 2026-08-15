import crypto from 'node:crypto'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const root = 'docs/evidence/p1b4d-pdf-watermark'
const manifest = JSON.parse(read(`${root}/manifest.json`))
const runtime = JSON.parse(read(`${root}/runtime-evidence.json`))
const independent = JSON.parse(read(`${root}/independent-verification.json`))
const watermark = JSON.parse(read('shared/pdf-watermark-safety-contract.json'))
const advanced = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const runner = read('scripts/run-p1b4d-pdf-watermark-audit.ps1')
const capture = read('scripts/capture-p1b4d-pdf-watermark-evidence.mjs')
const verifier = read('scripts/verify-p1b4d-pdf-watermark.py')
const audit = read('docs/P1B4D_PDF_Watermark_Desktop_Evidence_Audit_2026-08-16.md')

if (manifest.stage !== 'P1-B4D' || manifest.status !== 'accepted' || manifest.sourceCommit !== runtime.sourceCommit || manifest.sourceCommit !== '427a5b18f65485741072841dd8e1a2fc7ca89f1c' || manifest.sourceUserContentIncluded !== false || manifest.artifacts?.length !== 9) fail('P1-B4D manifest is invalid')
for (const artifact of manifest.artifacts) {
  const bytes = fs.readFileSync(`${root}/${artifact.file}`)
  if (bytes.length !== artifact.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) fail(`P1-B4D artifact integrity failed: ${artifact.file}`)
}
for (const viewport of [runtime.draftWide, runtime.verifiedWide, runtime.verifiedNarrow]) if (!viewport?.integrated || viewport.overflow > 2 || viewport.panel?.width < 280 || viewport.errorVisible) fail('P1-B4D responsive workspace evidence is invalid')
if (!runtime.passed || runtime.watermarkText !== '项目机密 P1B4D' || runtime.watermarkSpec?.angleDegrees !== -33 || runtime.watermarkSpec?.opacity !== 0.24 || !runtime.sourceUnchanged || runtime.runtimeErrorCount !== 0 || !runtime.draftGuard?.routeRetained || !runtime.draftGuard?.message?.includes('文字水印参数') || !runtime.verifiedWide?.verified || !runtime.verifiedNarrow?.verified || !runtime.reopened?.workspace || !runtime.reopened?.canvasReady || runtime.reopened?.pageCount !== 2) fail('P1-B4D desktop workflow evidence is invalid')
if (!independent.passed || independent.engine !== 'pypdf + Poppler + Pillow' || independent.sourcePages !== 2 || independent.targetPages !== 2 || independent.watermarkText !== runtime.watermarkText || independent.targetRender?.changedPixels < 800 || !Object.values(independent.checks || {}).every(Boolean)) fail('P1-B4D independent verification is invalid')
for (const token of ['cargo build --locked', 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', 'pdftoppm.exe', 'verify-p1b4d-pdf-watermark.py', 'finalize-p1b4d-pdf-watermark-evidence.mjs']) if (!runner.includes(token)) fail(`P1-B4D runner marker missing: ${token}`)
for (const token of ['Emulation.setDeviceMetricsOverride', 'watermark-verified-narrow.png', 'draftGuard', 'sourceUnchanged', 'watermark-saved-reopened.png']) if (!capture.includes(token)) fail(`P1-B4D capture marker missing: ${token}`)
for (const token of ['PdfReader', 'watermarkExtractedEveryPage', 'pageGeometryPreserved', 'annotationsPreserved', 'watermarkNotClipped', 'fullRewriteTrailerHasNoPrev']) if (!verifier.includes(token)) fail(`P1-B4D independent verifier marker missing: ${token}`)
if (watermark.stage !== 'P1-B4D' || watermark.status !== 'desktop-and-independent-render-verified' || watermark.currentWriteCapability !== true || watermark.implementationSlices?.find(item => item.id === 'P1-B4D')?.status !== 'completed') fail('P1-B4D watermark contract is stale')
if (!['P1-B4D', 'P1-B5A', 'P1-B5B'].includes(advanced.stage) || !['watermark-complete', 'metadata-safety-audit-complete', 'metadata-backend-complete'].includes(advanced.status) || !advanced.currentCapabilities?.includes('watermark-copy') || advanced.plannedSlices?.find(item => item.id === 'P1-B4')?.status !== 'completed') fail('P1-B4D advanced capability contract is stale')
for (const section of ['## 1. 阶段结论与需求对齐', '## 2. 真实桌面工作流', '## 3. 独立输出验证', '## 4. 视觉复核', '## 5. 能力边界与下一步']) if (!audit.includes(section)) fail(`P1-B4D audit section missing: ${section}`)

console.log('P1-B4D PDF watermark evidence passed: real Tauri workflow, source preservation, saved reopen, Unicode extraction, structure preservation and unclipped Poppler renders are accepted.')
