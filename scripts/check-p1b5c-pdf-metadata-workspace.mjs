import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const metadata = JSON.parse(read('shared/pdf-metadata-safety-contract.json'))
const advanced = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const view = read('src/views/PdfView.vue')
const panel = read('src/components/pdf/PdfMetadataPanel.vue')
const types = read('src/types/pdfMetadata.ts')
const audit = read('docs/P1B5C_PDF_Metadata_Workspace_Audit_2026-08-16.md')

if (metadata.stage !== 'P1-B5C' || metadata.status !== 'workspace-complete-desktop-evidence-pending' || metadata.currentWriteCapability !== true) fail('P1-B5C metadata workspace identity is stale')
const slice = metadata.implementationSlices?.find(item => item.id === 'P1-B5C')
if (slice?.status !== 'workspace-complete-desktop-evidence-pending' || slice?.deliveredWorkspace !== 'src/components/pdf/PdfMetadataPanel.vue' || slice?.workspaceHost !== 'src/views/PdfView.vue' || slice?.writeUserFile !== true) fail('P1-B5C implementation slice is stale')
if (advanced.stage !== 'P1-B5C' || advanced.status !== 'metadata-workspace-complete' || !advanced.currentCapabilities?.includes('metadata-copy') || advanced.plannedSlices?.find(item => item.id === 'P1-B5')?.currentWriteUserFile !== true) fail('P1-B5C public capability boundary is stale')
for (const token of ['PdfMetadataPanel', "sidebarTab === 'metadata'", 'openPdfMetadataPanel', 'loadPdfMetadataValues', 'previewPdfMetadataCopy', 'savePdfMetadataCopy', 'pdfMetadataDirty', '属性草稿', 'preview_pdf_metadata_copy', 'save_pdf_metadata_copy', 'openManagedFile']) if (!view.includes(token)) fail(`P1-B5C PdfView token missing: ${token}`)
for (const token of ['data-testid="p1b5c-pdf-metadata"', '文档属性，不是隐私清理', '这里只编辑标题、作者、主题和关键词四项描述属性', '清空字段会从新副本中移除对应属性', '另存属性副本并打开', 'var(--text-compact)', 'var(--workspace-border-color)', 'var(--theme-primary)']) if (!panel.includes(token)) fail(`P1-B5C panel token missing: ${token}`)
for (const token of ['PdfMetadataValues', 'PdfMetadataCopyReport', 'PdfSavedMetadataCopyReport', 'preservedStructureVerified', 'fullRewriteVerified']) if (!types.includes(token)) fail(`P1-B5C type token missing: ${token}`)
if (!view.includes("v-if=\"!isExternal\" class=\"fit-btn\" :class=\"{ active: sidebarTab === 'metadata' }\"") || !view.includes('v-else-if="!isExternal && sidebarTab === \'metadata\'"')) fail('P1-B5C must remain library-only inside the original PdfView workspace')
if (!view.includes("['thumbnails', 'outline', 'annotations', 'forms', 'metadata', 'redaction', 'watermark', 'ocr', 'organize']")) fail('P1-B5C sidebar restoration order is stale')
if (!view.includes('PDF 编辑草稿尚未生成新文件') || !view.includes('文档属性修改')) fail('P1-B5C draft leave guard is missing')
for (const section of ['## 1. 阶段结论', '## 2. 原工作区交互', '## 3. 安全保存与草稿保护', '## 4. UI 对齐', '## 5. 证据边界与下一步']) if (!audit.includes(section)) fail(`P1-B5C audit section missing: ${section}`)

console.log('P1-B5C PDF metadata workspace passed: the original right workspace exposes four bounded fields, explicit non-anonymization scope, draft protection, preview-locked reliable save and aligned responsive styling; desktop evidence remains pending.')
