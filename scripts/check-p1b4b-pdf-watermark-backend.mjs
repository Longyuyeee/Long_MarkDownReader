import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const engine = read('src-tauri/src/formats/pdf_watermark.rs')
const commands = read('src-tauri/src/commands/pdf.rs')
const tauri = read('src-tauri/src/lib.rs')
const view = read('src/views/PdfView.vue')
const watermark = JSON.parse(read('shared/pdf-watermark-safety-contract.json'))
const advanced = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const audit = read('docs/P1B4B_PDF_Watermark_Backend_Audit_2026-08-15.md')
const fail = message => { console.error(message); process.exit(1) }

for (const token of ['MAX_PDF_WATERMARK_SOURCE_BYTES', 'MAX_PDF_WATERMARK_OUTPUT_BYTES', 'MAX_PDF_WATERMARK_PAGES', 'NotoSansCJKsc-Regular.otf', 'GlyphRemapper', 'build_to_unicode', 'unique_resource_name', 'inherited_page_value', 'validated_page_ids', 'invalid_or_cyclic_page_tree', 'LongEditWatermark', '/Artifact << /Subtype /Watermark >> BDC', 'full_rewrite_verified', 'preservation_inventory', 'pdf_extract::extract_text_from_mem_by_pages', 'document.trailer.remove(b"Prev")']) if (!engine.includes(token)) fail(`P1-B4B engine marker missing: ${token}`)
for (const token of ['preview_pdf_watermark_copy', 'save_pdf_watermark_copy', 'save_pdf_watermark_copy_to_path', 'expected_output_digest', 'write_new_bytes', 'source_unchanged', 'watermark_copy_saves_unicode_new_target_reopens_and_preserves_source', 'watermark_copy_rejects_unsafe_text_and_signed_pdf']) if (!commands.includes(token)) fail(`P1-B4B command marker missing: ${token}`)
for (const token of ['preview_pdf_watermark_copy', 'save_pdf_watermark_copy']) if (!tauri.includes(token)) fail(`P1-B4B Tauri registration missing: ${token}`)
if (watermark.stage === 'P1-B4B' && (view.includes('data-testid="p1b4c-pdf-watermark"') || view.includes('previewPdfWatermarkCopy') || view.includes('savePdfWatermarkCopy'))) fail('P1-B4B must not expose the P1-B4C workspace prematurely')
if (!['P1-B4B', 'P1-B4C', 'P1-B4D'].includes(watermark.stage) || !['isolated-vector-backend-complete-workspace-pending', 'workspace-complete-desktop-evidence-pending', 'desktop-and-independent-render-verified'].includes(watermark.status) || watermark.currentWriteCapability !== ['P1-B4C', 'P1-B4D'].includes(watermark.stage) || watermark.backendWriteCapability !== true || watermark.implementationSlices?.find(item => item.id === 'P1-B4B')?.status !== 'completed' || !['planned', 'completed'].includes(watermark.implementationSlices?.find(item => item.id === 'P1-B4C')?.status)) fail('P1-B4B watermark contract is stale')
if (!['P1-B4B', 'P1-B4C', 'P1-B4D', 'P1-B5A', 'P1-B5B', 'P1-B5C'].includes(advanced.stage) || !['watermark-backend-complete', 'watermark-workspace-complete', 'watermark-complete', 'metadata-safety-audit-complete', 'metadata-backend-complete', 'metadata-workspace-complete'].includes(advanced.status) || advanced.currentCapabilities?.includes('watermark-copy') !== ['P1-B4C', 'P1-B4D', 'P1-B5A', 'P1-B5B', 'P1-B5C'].includes(advanced.stage) || !['isolated-vector-backend-complete-workspace-pending', 'workspace-complete-desktop-evidence-pending', 'completed'].includes(advanced.plannedSlices?.find(item => item.id === 'P1-B4')?.status) || advanced.plannedSlices?.find(item => item.id === 'P1-B4')?.backendWriteUserFile !== true || advanced.plannedSlices?.find(item => item.id === 'P1-B4')?.currentWriteUserFile !== ['P1-B4C', 'P1-B4D', 'P1-B5A', 'P1-B5B', 'P1-B5C'].includes(advanced.stage)) fail('P1-B4B advanced capability boundary is stale')
for (const section of ['## 1. 需求对齐与阶段结论', '## 2. 已实现的安全子集', '## 3. 隔离写入与保真', '## 4. 自动验证与视觉复核', '## 5. 能力边界与后续顺序']) if (!audit.includes(section)) fail(`P1-B4B audit section missing: ${section}`)

console.log('P1-B4B PDF watermark backend passed: bounded embedded Unicode vector overlays, private resources, digest-locked new-copy save, preservation inventory and reopen verification are aligned without premature UI.')
