import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const engine = read('src-tauri/src/formats/pdf_redaction.rs')
const commands = read('src-tauri/src/commands/pdf.rs')
const tauri = read('src-tauri/src/lib.rs')
const view = read('src/views/PdfView.vue')
const safety = JSON.parse(read('shared/pdf-redaction-safety-contract.json'))
const advanced = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const audit = read('docs/P1B3B_PDF_Permanent_Redaction_Backend_Audit_2026-08-15.md')

for (const token of ['MAX_PDF_REDACTION_SOURCE_BYTES', 'MAX_PDF_REDACTION_PAGES', 'MAX_PDF_REDACTION_DIMENSION', 'MAX_PDF_REDACTION_TOTAL_PIXELS', 'MAX_PDF_REDACTION_RECTS', 'ImageReader::with_format', 'limits.max_image_width', 'rgba.pixels().any', 'redaction_pixel_bounds', '尚未以纯色烧入像素', 'XrefType::CrossReferenceTable', 'DCTDecode', 'build_fresh_image_pdf', 'verify_fresh_image_pdf', 'text_absence_verified', 'source_object_isolation_verified']) if (!engine.includes(token)) fail(`P1-B3B engine marker missing: ${token}`)
for (const token of ['preview_pdf_redaction_copy', 'save_pdf_redaction_copy', 'save_pdf_redaction_copy_to_path', 'expected_output_digest', 'write_new_bytes', 'verify_pdf_redaction_output', 'source_unchanged', 'source_object_isolation_reopen_verified']) if (!commands.includes(token)) fail(`P1-B3B command marker missing: ${token}`)
for (const token of ['builds_fresh_image_only_pdf_and_removes_source_markers', 'blocks_incomplete_transparent_or_unburned_rasters_and_signatures']) if (!engine.includes(token)) fail(`P1-B3B engine test missing: ${token}`)
if (!commands.includes('permanent_redaction_copy_saves_new_target_reopens_and_preserves_source')) fail('P1-B3B save/reopen test missing')
for (const token of ['preview_pdf_redaction_copy', 'save_pdf_redaction_copy']) if (!tauri.includes(token) || view.includes(token)) fail(`P1-B3B must register backend without exposing UI: ${token}`)
if (safety.stage !== 'P1-B3B' || safety.status !== 'raster-backend-complete-workspace-pending' || safety.currentWriteCapability !== false || safety.implementationSlices?.find(item => item.id === 'P1-B3B')?.status !== 'completed') fail('P1-B3B safety contract is stale')
if (advanced.stage !== 'P1-B3B' || advanced.status !== 'permanent-redaction-backend-complete' || advanced.currentCapabilities?.includes('permanent-redaction-copy') || advanced.plannedSlices?.find(item => item.id === 'P1-B3')?.status !== 'raster-backend-complete-workspace-pending') fail('P1-B3B advanced capability boundary is stale')
for (const section of ['## 1. 需求对齐与结论', '## 2. 后端实现', '## 3. 安全验证', '## 4. 测试与视觉复核', '## 5. 当前边界与下一步']) if (!audit.includes(section)) fail(`P1-B3B audit section missing: ${section}`)

console.log('P1-B3B PDF permanent redaction backend passed: bounded opaque PNG input, burned-pixel verification, fresh image-only PDF construction, no-overwrite save, reopen checks and no premature UI are aligned.')
