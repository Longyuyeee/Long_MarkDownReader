import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [planSource, view, pageComponent, pdfCommands, reliableWrite] = await Promise.all([
  read('src/utils/pdfPagePlan.ts'),
  read('src/views/PdfView.vue'),
  read('src/components/PdfPage.vue'),
  read('src-tauri/src/commands/pdf.rs'),
  read('src-tauri/src/services/reliable_write.rs'),
])

const transpiled = ts.transpileModule(planSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const plan = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`)

const original = plan.createPdfPagePlan(3)
assert.deepEqual(original.map(entry => entry.sourcePage), [1, 2, 3])
assert.ok(original.every(entry => entry.rotation === 0 && !entry.removed))

const rotated = plan.rotatePdfPage(original, original[0].id, -90)
assert.equal(rotated[0].rotation, 270)
assert.equal(original[0].rotation, 0, 'page operations must not mutate their input snapshot')

const reordered = plan.movePdfPage(rotated, rotated[0].id, 1)
assert.deepEqual(reordered.map(entry => entry.sourcePage), [2, 1, 3])

const removed = plan.setPdfPageRemoved(reordered, reordered[0].id, true)
assert.equal(removed[0].removed, true)
assert.deepEqual(plan.summarizePdfPagePlan(removed), {
  rotated: 1,
  moved: 2,
  removed: 1,
  changed: 4,
})
assert.deepEqual(plan.parsePdfPageRange('1-2, 4', 5), [1, 2, 4])
assert.deepEqual(
  plan.createPdfExtractionPlan(5, [2, 4]).map(entry => [entry.sourcePage, entry.removed]),
  [[2, false], [4, false], [1, true], [3, true], [5, true]],
)
for (const invalid of ['', '0', '6', '3-1', '1,1', '1,,2', '1-5']) {
  assert.throws(() => plan.parsePdfPageRange(invalid, 5))
}

const requireText = (source, text, message) => {
  if (!source.includes(text)) throw new Error(message)
}

for (const text of [
  '页面整理草稿',
  '先在内存中预览',
  'pagePlanUndo',
  'pagePlanRedo',
  'visiblePagePlan.length <= 1',
  'onBeforeRouteLeave',
  'beforeunload',
]) requireText(view, text, `B0 PDF page organizer contract missing: ${text}`)

requireText(pageComponent, 'rotation?: number', 'PDF preview must accept a non-destructive relative rotation')
requireText(pageComponent, 'page.rotate + normalizedRotation.value', 'PDF preview must preserve the source page rotation')
if (/overwrite_pdf|write_pdf_document/.test(pdfCommands)) {
  throw new Error('PDF page planning must not expose a source-document overwrite command')
}

for (const text of [
  '验证隔离副本',
  'preview_pdf_page_plan_isolated_copy',
  'expectedSignature',
  '源文件未修改',
  '不会覆盖任何 PDF',
]) requireText(view, text, `B1A PDF isolated-copy contract missing: ${text}`)

for (const text of [
  'MAX_PDF_ISOLATED_INPUT_BYTES',
  'pdf_plan_blockers',
  'digital_signature_unverified',
  'acroform_unverified',
  'structural_reparse_verified',
  'text_order_verified',
  'source_unchanged',
]) requireText(pdfCommands, text, `B1A PDF backend safety gate missing: ${text}`)

for (const text of [
  '另存新 PDF 并打开',
  'save_pdf_page_plan_copy',
  'expectedOutputDigest',
  'targetFileName',
  'saved_verified',
]) requireText(view, text, `B1B PDF reliable-save UI contract missing: ${text}`)

for (const text of [
  'save_pdf_page_plan_copy',
  'validate_pdf_copy_file_name',
  'expected_output_digest',
  '目标文件已存在；可靠另存不会覆盖现有文件',
  'structural_reopen_verified',
  'text_reopen_verified',
]) requireText(pdfCommands, text, `B1B PDF backend gate missing: ${text}`)

for (const text of [
  'write_new_bytes',
  'create_new(true)',
  'hard_link',
  '可靠另存不会覆盖现有文件',
]) requireText(reliableWrite, text, `B1B no-clobber write contract missing: ${text}`)

for (const text of [
  '兼容矩阵',
  'pdfCompatibilityLabel',
  'compressedObjects',
  'inheritedPageValues',
  'textlessPages',
]) requireText(view, text, `B1C PDF compatibility UI contract missing: ${text}`)

for (const text of [
  'PdfPagePlanCompatibilityProfile',
  'normalized_pdf_page_text',
  'XrefEntry::Compressed',
  'b1c_accepts_modern_object_and_xref_streams_from_multiple_producers',
  'b1c_materializes_inherited_boxes_resources_and_rotation',
  'b1c_accepts_textless_scanned_pages_and_reliable_save',
  'b1c_high_risk_compatibility_matrix_is_stably_blocked',
  'b1c_encrypted_pdf_and_resource_limits_are_blocked_before_output',
]) requireText(pdfCommands, text, `B1C PDF backend compatibility gate missing: ${text}`)

for (const text of [
  '按范围提取页面',
  'parsePdfPageRange',
  'createPdfExtractionPlan',
  'preview_pdf_page_range_extract_copy',
  'save_pdf_page_range_copy',
  '提取为新 PDF 并打开',
  '源文件始终不变',
]) requireText(view, text, `B2A PDF page-range extraction UI contract missing: ${text}`)

for (const text of [
  'pdf_page_range_plan',
  'preview_pdf_page_range_extract_copy',
  'save_pdf_page_range_copy',
  'b2a_page_range_plan_preserves_requested_order_and_rejects_invalid_ranges',
  'b2a_extracts_selected_pages_to_verified_copy_without_touching_source',
]) requireText(pdfCommands, text, `B2A PDF page-range backend contract missing: ${text}`)

for (const text of [
  '合并多个 PDF',
  'pickPdfMergeInputs',
  'movePdfMergeInput',
  'preview_pdf_merge_isolated_copy',
  'save_pdf_merge_copy',
  '合并为新 PDF 并打开',
  '全部源文件未修改',
]) requireText(view, text, `B2B PDF merge UI contract missing: ${text}`)

for (const text of [
  'MAX_PDF_MERGE_INPUTS',
  'merge_pdf_documents',
  'materialize_pdf_page_inheritance',
  'page_geometry_verified',
  'preview_pdf_merge_isolated_copy',
  'save_pdf_merge_copy',
  'PDF 合并输入不能重复',
  '可靠合并不会覆盖现有文件',
  'b2b_merges_ordered_inputs_to_verified_copy_without_touching_sources',
  'b2b_rejects_duplicate_stale_and_encrypted_merge_inputs',
]) requireText(pdfCommands, text, `B2B PDF merge backend contract missing: ${text}`)

console.log('PDF B0-B2B contract passed: immutable planning, isolated verification, atomic no-clobber save, compatibility profiling, page-range extraction, ordered multi-file merge, and source safety.')
