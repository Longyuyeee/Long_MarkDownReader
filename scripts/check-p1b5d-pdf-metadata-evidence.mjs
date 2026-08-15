import crypto from 'node:crypto'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const root = 'docs/evidence/p1b5d-pdf-metadata'
const manifest = JSON.parse(read(`${root}/manifest.json`))
const runtime = JSON.parse(read(`${root}/runtime-evidence.json`))
const independent = JSON.parse(read(`${root}/independent-verification.json`))
const metadata = JSON.parse(read('shared/pdf-metadata-safety-contract.json'))
const advanced = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const runner = read('scripts/run-p1b5d-pdf-metadata-audit.ps1')
const capture = read('scripts/capture-p1b5d-pdf-metadata-evidence.mjs')
const verifier = read('scripts/verify-p1b5d-pdf-metadata.py')
const audit = read('docs/P1B5D_PDF_Metadata_Desktop_Evidence_Audit_2026-08-16.md')

if (manifest.stage !== 'P1-B5D' || manifest.status !== 'accepted' || manifest.sourceCommit !== runtime.sourceCommit || manifest.sourceCommit !== '453a024896a12640a9181c15894a4e39e934340a' || manifest.sourceUserContentIncluded !== false || manifest.artifacts?.length !== 10) fail('P1-B5D manifest is invalid')
for (const artifact of manifest.artifacts) {
  const bytes = fs.readFileSync(`${root}/${artifact.file}`)
  if (bytes.length !== artifact.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) fail(`P1-B5D artifact integrity failed: ${artifact.file}`)
}
for (const viewport of [runtime.draftWide, runtime.verifiedWide, runtime.verifiedNarrow]) if (!viewport?.integrated || viewport.overflow > 2 || viewport.panel?.width < 280 || viewport.errorVisible) fail('P1-B5D responsive workspace evidence is invalid')
if (!runtime.passed || runtime.requested?.title !== '知识图谱专业管理 P1B5D' || runtime.requested?.subject !== '' || !runtime.sourceUnchanged || runtime.runtimeErrorCount !== 0 || !runtime.draftGuard?.routeRetained || !runtime.draftGuard?.message?.includes('文档属性修改') || !runtime.verifiedWide?.verified || !runtime.verifiedNarrow?.verified || !runtime.reopened?.workspace || !runtime.reopened?.canvasReady || runtime.reopened?.pageCount !== 2) fail('P1-B5D desktop workflow evidence is invalid')
if (!independent.passed || independent.engine !== 'pypdf + Poppler + Pillow' || independent.sourcePages !== 2 || independent.targetPages !== 2 || !Object.values(independent.checks || {}).every(Boolean) || independent.checks?.subjectRemoved !== true || independent.checks?.popplerPixelsIdentical !== true) fail('P1-B5D independent verification is invalid')
for (const token of ['cargo build --locked', 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', 'pdftoppm.exe', 'verify-p1b5d-pdf-metadata.py', 'finalize-p1b5d-pdf-metadata-evidence.mjs']) if (!runner.includes(token)) fail(`P1-B5D runner marker missing: ${token}`)
for (const token of ['Emulation.setDeviceMetricsOverride', 'metadata-verified-narrow.png', 'draftGuard', 'sourceUnchanged', 'metadata-saved-reopened.png']) if (!capture.includes(token)) fail(`P1-B5D capture marker missing: ${token}`)
for (const token of ['PdfReader', 'requestedMetadataMatches', 'subjectRemoved', 'preservedInfoMatches', 'popplerPixelsIdentical', 'fullRewriteTrailerHasNoPrev']) if (!verifier.includes(token)) fail(`P1-B5D verifier marker missing: ${token}`)
if (metadata.stage !== 'P1-B5D' || metadata.status !== 'desktop-and-independent-render-verified' || metadata.currentWriteCapability !== true || metadata.implementationSlices?.find(item => item.id === 'P1-B5C')?.status !== 'completed' || metadata.implementationSlices?.find(item => item.id === 'P1-B5D')?.status !== 'completed') fail('P1-B5D metadata contract is stale')
if (advanced.stage !== 'P1-B5D' || advanced.status !== 'metadata-complete' || !advanced.currentCapabilities?.includes('metadata-copy') || advanced.plannedSlices?.find(item => item.id === 'P1-B5')?.status !== 'completed') fail('P1-B5D advanced capability contract is stale')
for (const section of ['## 1. 阶段结论与需求对齐', '## 2. 真实桌面工作流', '## 3. 独立输出验证', '## 4. 视觉复核', '## 5. 能力边界与下一步']) if (!audit.includes(section)) fail(`P1-B5D audit section missing: ${section}`)

console.log('P1-B5D PDF metadata evidence passed: original-workspace editing, draft protection, reliable copy, source preservation, metadata semantics and pixel-identical renders are accepted.')
