import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const view = read('src/views/PdfView.vue')
const page = read('src/components/PdfPage.vue')
const pipeline = read('src/utils/pdfRedaction.ts')
const commands = read('src-tauri/src/commands/pdf.rs')
const router = read('src/router/index.ts')
const safety = JSON.parse(read('shared/pdf-redaction-safety-contract.json'))
const advanced = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const audit = read('docs/P1B3C_PDF_Permanent_Redaction_Workspace_Audit_2026-08-15.md')

for (const token of ['openRedactionPanel', "sidebarTab === 'redaction'", 'data-testid="p1b3c-pdf-redaction"', 'createPdfRedaction', 'previewPdfRedactionCopy', 'savePdfRedactionCopy', "invoke<PdfRedactionCopyReport>('preview_pdf_redaction_copy'", "invoke<PdfSavedRedactionCopyReport>('save_pdf_redaction_copy'", 'pdfRedactionTradeoffConfirmed', '另存永久脱敏副本并打开', "await openManagedFile(router, saved.targetPath, {}, 'replace')", 'v-if="!isExternal"']) if (!view.includes(token)) fail(`P1-B3C workspace marker missing: ${token}`)
for (const token of ['pdf-redaction-layer', 'redaction-capture', "emit('redactionCreate'", 'width >= 0.01', 'PdfRedactionOverlay']) if (!page.includes(token)) fail(`P1-B3C page overlay marker missing: ${token}`)
for (const token of ['MAX_PDF_REDACTION_PAGES = 64', 'MAX_PDF_REDACTION_SOURCE_BYTES = 128 * 1024 * 1024', 'MAX_PDF_REDACTION_DIMENSION = 4096', 'MAX_PDF_REDACTION_TOTAL_PIXELS = 120_000_000', 'MAX_PDF_REDACTION_RECTS = 256', 'document.getData()', "crypto.subtle.digest('SHA-256'", 'for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++)', "getContext('2d', { alpha: false", "background: 'rgb(255,255,255)'", 'Math.ceil(rect.x * width)', 'Math.floor((rect.x + rect.width) * width)', 'context.fillRect(x0, y0, x1 - x0, y1 - y0)', "canvas.toBlob(resolve, 'image/png')", 'reader.readAsDataURL(blob)']) if (!pipeline.includes(token)) fail(`P1-B3C trusted raster marker missing: ${token}`)
for (const token of ['PdfEncodedRedactionPage', 'png_base64', 'STANDARD', '.decode(page.png_base64.as_bytes())', 'MAX_PDF_REDACTION_RASTER_BYTES', 'decode_pdf_redaction_pages', 'redaction_ipc_pages_decode_strict_base64_and_enforce_budget']) if (!commands.includes(token)) fail(`P1-B3C IPC boundary marker missing: ${token}`)
if (router.includes("path: '/redaction'")) fail('P1-B3C must remain inside the original PdfView workspace')
if (!['P1-B3C', 'P1-B3D'].includes(safety.stage) || !['workspace-complete-desktop-evidence-pending', 'desktop-and-independent-render-verified'].includes(safety.status) || safety.currentWriteCapability !== true || safety.implementationSlices?.find(item => item.id === 'P1-B3C')?.status !== 'completed') fail('P1-B3C safety contract is stale')
if (!['P1-B3C', 'P1-B3D', 'P1-B4A', 'P1-B4B'].includes(advanced.stage) || !['permanent-redaction-workspace-complete', 'permanent-redaction-complete', 'watermark-safety-audit-complete', 'watermark-backend-complete'].includes(advanced.status) || !advanced.currentCapabilities?.includes('permanent-redaction-copy') || !['workspace-complete-desktop-evidence-pending', 'completed'].includes(advanced.plannedSlices?.find(item => item.id === 'P1-B3')?.status) || advanced.plannedSlices?.find(item => item.id === 'P1-B3')?.currentWriteUserFile !== true) fail('P1-B3C advanced capability contract is stale')
for (const section of ['## 1. 需求对齐与结论', '## 2. 原工作区交互', '## 3. 全页可信栅格与 IPC 边界', '## 4. 可靠另存与安全状态', '## 5. 验证与下一步']) if (!audit.includes(section)) fail(`P1-B3C audit section missing: ${section}`)

console.log('P1-B3C PDF permanent redaction workspace passed: original right workspace selection, full-page opaque PDF.js rasterization, bounded Base64 IPC, digest-locked reliable save and explicit image-only tradeoff are aligned.')
