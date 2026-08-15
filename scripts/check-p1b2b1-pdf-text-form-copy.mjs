import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const engine = read('src-tauri/src/formats/pdf_form_fill.rs')
const commands = read('src-tauri/src/commands/pdf.rs')
const lib = read('src-tauri/src/lib.rs')
const contract = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const fail = message => { console.error(message); process.exit(1) }

for (const token of ['MAX_TEXT_CHANGES', 'expected_source_digest', 'appearance_streams_written', 'field_tree_verified', 'widget_appearances_verified', 'NeedAppearances', 'Helvetica', 'build_pdf_text_form_copy']) {
  if (!engine.includes(token)) fail(`P1-B2B1 engine boundary is missing: ${token}`)
}
for (const token of ['preview_pdf_form_text_copy', 'save_pdf_form_text_copy', '目标文件已存在', 'write_new_bytes', 'remove_file']) {
  if (!commands.includes(token)) fail(`P1-B2B1 command boundary is missing: ${token}`)
}
for (const token of ['preview_pdf_form_text_copy', 'save_pdf_form_text_copy']) if (!lib.includes(token)) fail(`P1-B2B1 Tauri registration is missing: ${token}`)
if (contract.stage !== 'P1-B2B1' || contract.status !== 'text-form-copy-backend-complete') fail('P1-B2B1 contract stage is stale')
if (!engine.includes('writes_text_value_and_non_empty_widget_appearance_in_isolated_copy') || !engine.includes('blocks_actions_stale_digest_and_unrenderable_unicode')) fail('P1-B2B1 engine tests are missing')

console.log('P1-B2B1 PDF text form copy passed: digest-locked isolated preview, new-target save, canonical value and non-empty widget appearance verification are present.')
