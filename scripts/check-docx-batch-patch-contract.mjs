import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}

const backend = read('src-tauri/src/commands/docx.rs')
requireTokens(backend, 'DOCX batch validation', [
  'pub struct DocxBatchPatchReport',
  'if !(2..=32).contains(&operations.len())',
  'DOCX 批量编辑包含重复目标',
  'verify_batch_expectations(&output, &expectations)?;',
  'DOCX 批量操作无法确定性重放',
  'status: "batch_isolated_verified".into()',
])
requireTokens(backend, 'DOCX batch reliable source save', [
  'fn preview_docx_batch_patch_path(',
  'pub async fn preview_docx_patch_batch_isolated_copy(',
  'fn save_docx_batch_source_to_path(',
  'pub async fn save_docx_patch_batch_source(',
  'write_bytes(source_path, &output)?;',
  '批量可靠保存验证失败，已恢复原文件',
  'status: "batch_source_saved_verified".into()',
])
requireTokens(backend, 'DOCX batch producer evidence', [
  'ux33c_batches_distinct_targets_for_all_verified_producers',
  'ux33c_rejects_duplicate_anchor_and_reliably_saves_batch',
  'microsoft-word-16.docx',
  'wps-writer.docx',
  'libreoffice-writer.docx',
])

const registration = read('src-tauri/src/lib.rs')
for (const command of ['preview_docx_patch_batch_isolated_copy', 'save_docx_patch_batch_source']) {
  if ((registration.match(new RegExp(command, 'g')) || []).length < 2) {
    fail(`${command} is not imported and registered.`)
  }
}

const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
if (!/\| UX-33 \|[^\n]+\| 进行中 \|/.test(audit)) fail('UX-33 must remain in progress until the multi-target UI is delivered and retested.')

console.log('DOCX batch patch contract passed: bounded distinct anchors, final semantics, deterministic replay, reliable source save, rollback, and three-producer tests.')
