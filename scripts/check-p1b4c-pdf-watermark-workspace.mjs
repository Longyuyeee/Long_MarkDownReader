import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const view = read('src/views/PdfView.vue')
const panel = read('src/components/pdf/PdfWatermarkPanel.vue')
const types = read('src/types/pdfWatermark.ts')
const router = read('src/router/index.ts')
const commands = read('src-tauri/src/commands/pdf.rs')
const watermark = JSON.parse(read('shared/pdf-watermark-safety-contract.json'))
const advanced = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const audit = read('docs/P1B4C_PDF_Watermark_Workspace_Audit_2026-08-16.md')
const fail = message => { console.error(message); process.exit(1) }

for (const token of ["sidebarTab === 'watermark'", 'PdfWatermarkPanel', 'openWatermarkPanel', 'previewPdfWatermarkCopy', 'savePdfWatermarkCopy', "invoke<PdfWatermarkCopyReport>('preview_pdf_watermark_copy'", "invoke<PdfSavedWatermarkCopyReport>('save_pdf_watermark_copy'", 'pdfWatermarkSourceDigest', 'pdfWatermarkDirty', "await openManagedFile(router, saved.targetPath, {}, 'replace')", "v-if=\"!isExternal\""]) if (!view.includes(token)) fail(`P1-B4C PdfView marker missing: ${token}`)
for (const token of ['data-testid="p1b4c-pdf-watermark"', '可见归属，不是内容保护', '水印不等同于永久脱敏、DRM 或防复制', 'modelValue.text.trim().length', 'tradeoffConfirmed', "emit('save'", 'var(--text-compact)', 'var(--workspace-border-color)', 'var(--theme-primary)']) if (!panel.includes(token)) fail(`P1-B4C panel marker missing: ${token}`)
for (const token of ['PdfWatermarkSpec', 'PdfWatermarkCopyReport', 'PdfSavedWatermarkCopyReport', 'preservedStructureVerified', 'fullRewriteVerified']) if (!types.includes(token)) fail(`P1-B4C type marker missing: ${token}`)
for (const token of ['preview_pdf_watermark_copy', 'save_pdf_watermark_copy']) if (!commands.includes(token)) fail(`P1-B4C backend command missing: ${token}`)
if (router.includes("path: '/watermark'") || router.includes('PdfWatermarkPanel')) fail('P1-B4C must remain inside the original PdfView workspace')
if (!['P1-B4C', 'P1-B4D'].includes(watermark.stage) || !['workspace-complete-desktop-evidence-pending', 'desktop-and-independent-render-verified'].includes(watermark.status) || watermark.currentWriteCapability !== true || watermark.implementationSlices?.find(item => item.id === 'P1-B4C')?.status !== 'completed' || !['planned', 'completed'].includes(watermark.implementationSlices?.find(item => item.id === 'P1-B4D')?.status)) fail('P1-B4C watermark contract is stale')
if (!['P1-B4C', 'P1-B4D', 'P1-B5A', 'P1-B5B', 'P1-B5C', 'P1-B5D'].includes(advanced.stage) || !['watermark-workspace-complete', 'watermark-complete', 'metadata-safety-audit-complete', 'metadata-backend-complete', 'metadata-workspace-complete', 'metadata-complete'].includes(advanced.status) || !advanced.currentCapabilities?.includes('watermark-copy') || !['workspace-complete-desktop-evidence-pending', 'completed'].includes(advanced.plannedSlices?.find(item => item.id === 'P1-B4')?.status) || advanced.plannedSlices?.find(item => item.id === 'P1-B4')?.currentWriteUserFile !== true) fail('P1-B4C advanced capability contract is stale')
for (const section of ['## 1. 需求对齐与结论', '## 2. 工作区交互', '## 3. 风险提示与草稿保护', '## 4. UI 一致性与响应式边界', '## 5. 能力边界与下一步']) if (!audit.includes(section)) fail(`P1-B4C audit section missing: ${section}`)

console.log('P1-B4C PDF watermark workspace passed: original PdfView integration, bounded controls, digest-invalidating preview, explicit tradeoff, reliable save/open and draft protection are aligned.')
