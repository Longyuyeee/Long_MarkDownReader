import crypto from 'node:crypto'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const root = 'docs/evidence/p1b3d-pdf-redaction'
const manifest = JSON.parse(read(`${root}/manifest.json`))
const runtime = JSON.parse(read(`${root}/runtime-evidence.json`))
const independent = JSON.parse(read(`${root}/independent-verification.json`))
const safety = JSON.parse(read('shared/pdf-redaction-safety-contract.json'))
const advanced = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const runner = read('scripts/run-p1b3d-pdf-redaction-audit.ps1')
const capture = read('scripts/capture-p1b3d-pdf-redaction-evidence.mjs')
const verifier = read('scripts/verify-p1b3d-pdf-redaction.py')
const audit = read('docs/P1B3D_PDF_Permanent_Redaction_Desktop_Evidence_Audit_2026-08-15.md')

if (manifest.stage !== 'P1-B3D' || manifest.status !== 'accepted' || manifest.sourceCommit !== runtime.sourceCommit || manifest.sourceUserContentIncluded !== false || manifest.artifacts?.length !== 8) fail('P1-B3D manifest is invalid')
for (const artifact of manifest.artifacts) {
  const bytes = fs.readFileSync(`${root}/${artifact.file}`)
  if (bytes.length !== artifact.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) fail(`P1-B3D artifact integrity failed: ${artifact.file}`)
}
for (const viewport of [runtime.draftWide, runtime.verifiedWide, runtime.verifiedNarrow]) if (!viewport?.integrated || viewport.overflow > 2 || viewport.panel?.width < 280 || viewport.errorVisible) fail('P1-B3D responsive workspace evidence is invalid')
if (!runtime.passed || !runtime.sourceUnchanged || !runtime.targetSecretBytesAbsent || runtime.runtimeErrorCount !== 0 || !runtime.draftGuard?.routeRetained || !runtime.draftGuard?.message?.includes('永久脱敏框选') || !runtime.verifiedWide?.verified || !runtime.verifiedNarrow?.verified || !runtime.reopened?.workspace || !runtime.reopened?.canvasReady || runtime.reopened?.pageCount !== 2) fail('P1-B3D desktop workflow evidence is invalid')
if (!independent.passed || independent.engine !== 'pypdf + Poppler + Pillow' || independent.sourcePages !== 2 || independent.targetPages !== 2 || independent.targetTextLength !== 0 || independent.targetAnnotations !== 0 || independent.targetRender?.blackRatio < 0.985 || independent.targetRender?.publicDarkPixels < 50 || !Object.values(independent.checks || {}).every(Boolean)) fail('P1-B3D independent verification is invalid')
for (const token of ['cargo build --locked', 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', 'pdftoppm.exe', 'verify-p1b3d-pdf-redaction.py', 'finalize-p1b3d-pdf-redaction-evidence.mjs']) if (!runner.includes(token)) fail(`P1-B3D runner marker missing: ${token}`)
for (const token of ['Input.dispatchMouseEvent', 'redaction-verified-narrow.png', 'draftGuard', 'sourceUnchanged', 'targetSecretBytesAbsent', 'redaction-saved-reopened.png']) if (!capture.includes(token)) fail(`P1-B3D capture marker missing: ${token}`)
for (const token of ['PdfReader', 'targetTextEmpty', 'redactionOpaqueBlack', 'annotationsRemoved', 'outlinesRemoved', 'publicRegionReadable']) if (!verifier.includes(token)) fail(`P1-B3D independent verifier marker missing: ${token}`)
if (safety.stage !== 'P1-B3D' || safety.status !== 'desktop-and-independent-render-verified' || safety.currentWriteCapability !== true || safety.implementationSlices?.find(item => item.id === 'P1-B3D')?.status !== 'completed') fail('P1-B3D safety contract is stale')
if (!['P1-B3D', 'P1-B4A', 'P1-B4B', 'P1-B4C', 'P1-B4D', 'P1-B5A', 'P1-B5B', 'P1-B5C'].includes(advanced.stage) || !['permanent-redaction-complete', 'watermark-safety-audit-complete', 'watermark-backend-complete', 'watermark-workspace-complete', 'watermark-complete', 'metadata-safety-audit-complete', 'metadata-backend-complete', 'metadata-workspace-complete'].includes(advanced.status) || !advanced.currentCapabilities?.includes('permanent-redaction-copy') || advanced.plannedSlices?.find(item => item.id === 'P1-B3')?.status !== 'completed') fail('P1-B3D advanced capability contract is stale')
for (const section of ['## 1. 阶段结论与需求对齐', '## 2. 真实桌面工作流', '## 3. 独立输出验证', '## 4. 视觉复核', '## 5. 能力边界与下一步']) if (!audit.includes(section)) fail(`P1-B3D audit section missing: ${section}`)

console.log('P1-B3D PDF permanent redaction evidence passed: real Tauri workflow, source preservation, saved reopen, empty text structure and independent opaque Poppler render are accepted.')
