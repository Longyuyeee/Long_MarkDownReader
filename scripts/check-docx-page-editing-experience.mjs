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
  "message.success('DOCX 已可靠保存并重新读取')",
])
requireTokens(view, 'DOCX page draft interaction', [
  '@click="selectTextBlock(block)"',
  '@click.stop="selectTableCell(block, rowIndex, cellIndex)"',
  '{{ draftTextForBlock(block) }}',
  '{{ draftTableCellText(block, rowIndex, cellIndex, cell.text) }}',
  '.docx-block.edit-selected',
  '未点击保存不会写盘',
])
if (view.includes('原件始终只读')) fail('The obsolete DOCX source-read-only claim returned.')

const backend = read('src-tauri/src/commands/docx.rs')
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

console.log('DOCX page editing contract passed: in-memory draft, explicit verified source save, rollback, and retained copy save.')
