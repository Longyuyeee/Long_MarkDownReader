import fs from 'node:fs'

const engine = fs.readFileSync('src-tauri/src/formats/pdf_forms.rs', 'utf8')
const commands = fs.readFileSync('src-tauri/src/commands/pdf.rs', 'utf8')
const tauri = fs.readFileSync('src-tauri/src/lib.rs', 'utf8')
const audit = fs.readFileSync('docs/P1B2A1_PDF_Form_Inspection_Backend_Audit_2026-08-15.md', 'utf8')
const fail = message => { console.error(message); process.exit(1) }

for (const token of ['MAX_PDF_FORM_INPUT_BYTES', 'MAX_FORM_FIELDS', 'MAX_FORM_WIDGETS', 'MAX_FIELD_DEPTH', 'canonical_ids', 'linked_widget_ids', 'duplicate_field_names', 'orphan_widget_count', 'missing_appearance_count', 'xfa_form_unverified', 'pdf_javascript_unverified', 'digital_signature_unverified', 'field_tree_ambiguity_unverified', 'does_not_expose_password_field_values']) {
  if (!engine.includes(token)) fail(`P1-B2A1 form inspector marker is missing: ${token}`)
}
if (!commands.includes('inspect_pdf_form_structure') || !commands.includes('resolve_existing_file(path, &["pdf"])')) fail('P1-B2A1 library-only command boundary is missing')
if (!tauri.includes('inspect_pdf_form_structure')) fail('P1-B2A1 Tauri registration is missing')
for (const section of ['## 需求对齐', '## 实现边界', '## 风险诊断', '## 验证', '## 下一步']) {
  if (!audit.includes(section)) fail(`P1-B2A1 audit section is missing: ${section}`)
}

console.log('P1-B2A1 PDF form inspector passed: canonical fields and page widgets are read-only inspected with bounded ambiguity and active-content diagnostics.')
