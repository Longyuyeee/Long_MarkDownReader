import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}

const view = read('src/views/DocxReaderView.vue')
requireTokens(view, 'DOCX explicit source save', [
  'Word 页面编辑 · 草稿只驻留内存 · 点击保存才写入',
  "invoke<DocxSavedSourceReport>('save_docx_patch_source'",
  "title: '覆盖当前 DOCX？'",
  "positiveText: '保存到原文件'",
  'saved.rollbackProtected',
  'message.success(`DOCX 已可靠保存 ${operations.length} 项修改并重新读取`)',
])
requireTokens(view, 'DOCX page draft interaction', [
  '@click="selectTextBlock(block)"',
  '@click.stop="selectTableCell(block, rowIndex, cellIndex)"',
  '{{ draftTextForBlock(block) }}',
  '{{ draftTableCellText(block, rowIndex, cellIndex, cell.text) }}',
  '.docx-block.edit-selected',
  '未点击保存不会写盘',
])
requireTokens(view, 'DOCX paged draft workspace', [
  'v-for="(page, pageIndex) in documentPages"',
  "block.kind === 'page-break' || block.kind === 'rendered-page-break'",
  "pushPage('section')",
  "'--page-ratio': `${width} / ${height}`",
  'aspect-ratio: var(--page-ratio, 0.707)',
  '{{ documentPages.length }} 页',
  'title="返回上一页"',
  'title="撤销草稿修改"',
  'title="重做草稿修改"',
  'const undoDraft = () =>',
  'const redoDraft = () =>',
])
requireTokens(view, 'DOCX multi-target draft workspace', [
  'const draftEntries = ref(new Map<string, DocxDraftEntry>())',
  'const semanticAnchor = (target: DocxEditableTarget)',
  'const syncCurrentDraft = () =>',
  'const removeDraftEntry = (entry: DocxDraftEntry)',
  'const locateDraftEntry = (entry: DocxDraftEntry)',
  'aria-label="DOCX 修改清单"',
  '{{ draftCount }}/32',
  "'preview_docx_patch_batch_isolated_copy'",
  "'save_docx_patch_batch_copy'",
  "'save_docx_patch_batch_source'",
  "'batch_isolated_verified'",
  "'batch_saved_verified'",
  "'batch_source_saved_verified'",
  'previewReport.value.deterministicReplayVerified',
  'previewReport.value.temporaryCopyReopenVerified',
  'message.success(`已可靠另存并验证 ${operations.length} 项修改',
])
requireTokens(view, 'DOCX direct color and font-size editing', [
  '<span>字色</span>',
  'type="color"',
  '<span>字号</span>',
  'const fontSizeOptions = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72]',
  'fontColor: draftFontColor.value ? draftFontColor.value.slice(1).toUpperCase() : null',
  'fontSizeHalfPoints: draftFontSizeHalfPoints.value',
])
requireTokens(view, 'DOCX unsaved draft protection', [
  "title: 'DOCX 还有未保存修改'",
  "default: () => '继续编辑'",
  "default: () => '放弃并离开'",
  "default: () => previewReport.value ? '保存并离开' : '先验证后保存'",
  'onBeforeRouteLeave(() => mayLeave())',
  'onBeforeRouteUpdate((to, from)',
  "window.addEventListener('beforeunload', beforeUnload)",
])
if (view.includes('原件始终只读')) fail('The obsolete DOCX source-read-only claim returned.')

const backend = read('src-tauri/src/commands/docx.rs')
const patchKernel = read('src-tauri/src/formats/docx_patch.rs')
requireTokens(patchKernel, 'DOCX safe direct color and font-size kernel', [
  'pub font_color: Option<String>',
  'pub font_size_half_points: Option<u16>',
  'DOCX 字体颜色必须是 6 位 RGB 十六进制值',
  'DOCX 字号必须在 8–72 磅之间',
  'ux33f_audits_all_producers_and_round_trips_only_safe_style_targets',
])
requireTokens(backend, 'DOCX reliable source transaction', [
  'fn save_docx_patch_source_to_path(',
  'write_bytes(source_path, &output)?;',
  'write_bytes(source_path, &source)',
  '可靠保存验证失败，已恢复原文件',
  'status: "source_saved_verified".into()',
  'pub async fn save_docx_patch_source(',
  'ux33_saves_verified_patch_to_source_and_rejects_stale_inputs',
])

const registration = read('src-tauri/src/lib.rs')
if ((registration.match(/save_docx_patch_source/g) || []).length < 2) {
  fail('DOCX source-save command is not imported and registered.')
}

const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
if (!/\| UX-33 \|[^\n]+\| 进行中 \|/.test(audit)) fail('UX-33 must remain in progress after the source-save baseline.')

console.log('DOCX page editing contract passed: paged canvas, multi-target drafts, direct RGB/font-size formatting, reliable copy/source saves, and guarded navigation.')
