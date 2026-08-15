import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const safety = JSON.parse(read('shared/pdf-redaction-safety-contract.json'))
const advanced = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const audit = read('docs/P1B3A_PDF_Permanent_Redaction_Safety_Audit_2026-08-15.md')
const cargo = read('src-tauri/Cargo.toml')
const pkg = JSON.parse(read('package.json'))
const commands = read('src-tauri/src/commands/pdf.rs')
const tauri = read('src-tauri/src/lib.rs')
const view = read('src/views/PdfView.vue')

if (!['P1-B3A', 'P1-B3B', 'P1-B3C', 'P1-B3D'].includes(safety.stage) || !['safety-audit-complete', 'raster-backend-complete-workspace-pending', 'workspace-complete-desktop-evidence-pending', 'desktop-and-independent-render-verified'].includes(safety.status) || safety.currentWriteCapability !== ['P1-B3C', 'P1-B3D'].includes(safety.stage) || safety.approvedArchitecture !== 'fresh-document-full-page-rasterization') fail('P1-B3A safety contract stage is stale')
for (const item of ['visual-overlay-only', 'incremental-update-that-keeps-old-revisions', 'content-operator-bounding-box-heuristics', 'copying-unaffected-pages-or-shared-source-resources', 'annotation-or-sidecar-redaction', 'reusing-source-ocr-text']) if (!safety.rejectedApproaches?.includes(item)) fail(`P1-B3A rejected approach missing: ${item}`)
for (const item of ['every-source-page-is-rendered-to-an-opaque-bitmap', 'redaction-rectangles-are-burned-into-pixels-before-image-encoding', 'output-is-built-from-a-new-empty-pdf-document', 'source-content-streams-fonts-images-xobjects-and-object-ids-are-never-copied', 'output-object-graph-is-limited-to-catalog-pages-page-content-and-image-xobjects']) if (!safety.securityInvariants?.includes(item)) fail(`P1-B3A security invariant missing: ${item}`)
for (const item of ['pdf-text-extraction-returns-empty-for-every-output-page', 'fixture-secret-markers-are-absent-from-output-bytes-and-extracted-text', 'independent-poppler-render-confirms-opaque-redaction-and-readable-unredacted-regions']) if (!safety.verificationGates?.includes(item)) fail(`P1-B3A verification gate missing: ${item}`)
if (safety.inputConstraints?.maxPages !== 64 || safety.inputConstraints?.maxRenderedDimensionPixels !== 4096 || safety.inputConstraints?.maxTotalRenderedPixels !== 120000000 || safety.inputConstraints?.maxRedactionRects !== 256) fail('P1-B3A resource budgets are stale')
if (!['P1-B3A', 'P1-B3B', 'P1-B3C', 'P1-B3D', 'P1-B4A', 'P1-B4B', 'P1-B4C', 'P1-B4D', 'P1-B5A', 'P1-B5B', 'P1-B5C', 'P1-B5D'].includes(advanced.stage) || !['permanent-redaction-safety-audit-complete', 'permanent-redaction-backend-complete', 'permanent-redaction-workspace-complete', 'permanent-redaction-complete', 'watermark-safety-audit-complete', 'watermark-backend-complete', 'watermark-workspace-complete', 'watermark-complete', 'metadata-safety-audit-complete', 'metadata-backend-complete', 'metadata-workspace-complete', 'metadata-complete'].includes(advanced.status) || advanced.currentCapabilities?.includes('permanent-redaction-copy') !== ['P1-B3C', 'P1-B3D', 'P1-B4A', 'P1-B4B', 'P1-B4C', 'P1-B4D', 'P1-B5A', 'P1-B5B', 'P1-B5C', 'P1-B5D'].includes(advanced.stage)) fail('P1-B3A advanced capability lineage is stale')
const slice = advanced.plannedSlices?.find(item => item.id === 'P1-B3')
if (!['safety-audit-complete-raster-backend-pending', 'raster-backend-complete-workspace-pending', 'workspace-complete-desktop-evidence-pending', 'completed'].includes(slice?.status) || slice?.deliveredContract !== 'shared/pdf-redaction-safety-contract.json' || slice?.currentWriteUserFile !== ['P1-B3C', 'P1-B3D', 'P1-B4A', 'P1-B4B', 'P1-B4C', 'P1-B4D', 'P1-B5A', 'P1-B5B', 'P1-B5C', 'P1-B5D'].includes(advanced.stage)) fail('P1-B3A implementation boundary is stale')
if (!cargo.includes('lopdf = { version = "=0.42.0"') || !cargo.includes('image = { version = "=0.25.10"') || !pkg.dependencies?.['pdfjs-dist']) fail('P1-B3A selected local render/rebuild dependencies are unavailable')
for (const token of ['preview_pdf_redaction_copy', 'save_pdf_redaction_copy']) {
  if (safety.stage === 'P1-B3A' && (commands.includes(token) || tauri.includes(token) || view.includes(token))) fail(`P1-B3A audit must not expose a premature writer: ${token}`)
  if (safety.stage === 'P1-B3B' && (!commands.includes(token) || !tauri.includes(token) || view.includes(token))) fail(`P1-B3B backend command must exist without premature UI: ${token}`)
  if (['P1-B3C', 'P1-B3D'].includes(safety.stage) && (!commands.includes(token) || !tauri.includes(token) || !view.includes(token))) fail(`P1-B3C workspace command wiring is missing: ${token}`)
}
for (const section of ['## 1. 需求对齐与审计结论', '## 2. 威胁模型', '## 3. 方案比较与决定', '## 4. 冻结的安全合同', '## 5. 验证计划', '## 6. 后续实施顺序']) if (!audit.includes(section)) fail(`P1-B3A audit section missing: ${section}`)

console.log('P1-B3A PDF permanent redaction safety audit passed: overlay and heuristic removal are rejected, fresh full-document raster reconstruction is frozen, and no writer is prematurely exposed.')
