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

if (safety.stage !== 'P1-B3A' || safety.status !== 'safety-audit-complete' || safety.currentWriteCapability !== false || safety.approvedArchitecture !== 'fresh-document-full-page-rasterization') fail('P1-B3A safety contract stage is stale')
for (const item of ['visual-overlay-only', 'incremental-update-that-keeps-old-revisions', 'content-operator-bounding-box-heuristics', 'copying-unaffected-pages-or-shared-source-resources', 'annotation-or-sidecar-redaction', 'reusing-source-ocr-text']) if (!safety.rejectedApproaches?.includes(item)) fail(`P1-B3A rejected approach missing: ${item}`)
for (const item of ['every-source-page-is-rendered-to-an-opaque-bitmap', 'redaction-rectangles-are-burned-into-pixels-before-image-encoding', 'output-is-built-from-a-new-empty-pdf-document', 'source-content-streams-fonts-images-xobjects-and-object-ids-are-never-copied', 'output-object-graph-is-limited-to-catalog-pages-page-content-and-image-xobjects']) if (!safety.securityInvariants?.includes(item)) fail(`P1-B3A security invariant missing: ${item}`)
for (const item of ['pdf-text-extraction-returns-empty-for-every-output-page', 'fixture-secret-markers-are-absent-from-output-bytes-and-extracted-text', 'independent-poppler-render-confirms-opaque-redaction-and-readable-unredacted-regions']) if (!safety.verificationGates?.includes(item)) fail(`P1-B3A verification gate missing: ${item}`)
if (safety.inputConstraints?.maxPages !== 64 || safety.inputConstraints?.maxRenderedDimensionPixels !== 4096 || safety.inputConstraints?.maxTotalRenderedPixels !== 120000000 || safety.inputConstraints?.maxRedactionRects !== 256) fail('P1-B3A resource budgets are stale')
if (advanced.stage !== 'P1-B3A' || advanced.status !== 'permanent-redaction-safety-audit-complete' || advanced.currentCapabilities?.includes('permanent-redaction-copy')) fail('P1-B3A advanced capability must remain audit-only')
const slice = advanced.plannedSlices?.find(item => item.id === 'P1-B3')
if (slice?.status !== 'safety-audit-complete-raster-backend-pending' || slice?.deliveredContract !== 'shared/pdf-redaction-safety-contract.json' || slice?.currentWriteUserFile !== false) fail('P1-B3A implementation boundary is stale')
if (!cargo.includes('lopdf = { version = "=0.42.0"') || !cargo.includes('image = { version = "=0.25.10"') || !pkg.dependencies?.['pdfjs-dist']) fail('P1-B3A selected local render/rebuild dependencies are unavailable')
for (const token of ['preview_pdf_redaction_copy', 'save_pdf_redaction_copy']) if (commands.includes(token) || tauri.includes(token) || view.includes(token)) fail(`P1-B3A audit must not expose a premature writer: ${token}`)
for (const section of ['## 1. 需求对齐与审计结论', '## 2. 威胁模型', '## 3. 方案比较与决定', '## 4. 冻结的安全合同', '## 5. 验证计划', '## 6. 后续实施顺序']) if (!audit.includes(section)) fail(`P1-B3A audit section missing: ${section}`)

console.log('P1-B3A PDF permanent redaction safety audit passed: overlay and heuristic removal are rejected, fresh full-document raster reconstruction is frozen, and no writer is prematurely exposed.')
