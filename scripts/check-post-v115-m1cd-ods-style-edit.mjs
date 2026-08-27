import fs from 'node:fs'

const audit = JSON.parse(fs.readFileSync('docs/evidence/post-v115-m1cd-ods-style-edit/audit.json', 'utf8'))
const backend = fs.readFileSync('src-tauri/src/formats/odf_edit.rs', 'utf8')
const command = fs.readFileSync('src-tauri/src/commands/odf_content.rs', 'utf8')
const view = fs.readFileSync('src/views/OdfContentReaderView.vue', 'utf8')
const formats = JSON.parse(fs.readFileSync('shared/file-formats.json', 'utf8'))

const failures = []
if (audit.stage !== 'M1C-D-ODS-existing-named-style' || audit.status !== 'passed') failures.push('stage/status')
if (audit.actual?.initialStyle !== 'Default' || audit.actual?.uiReopenedStyle !== 'Good') failures.push('desktop semantic reopen')
if (audit.actual?.libreOfficeFill !== 'FFCCFFCC' || audit.actual?.libreOfficeFont !== 'FF006600') failures.push('LibreOffice style evidence')
if (!audit.actual?.sourceUnchanged || audit.actual?.sourceBeforeSha256 !== audit.actual?.sourceAfterSha256) failures.push('source preservation')
if (!audit.actual?.undoRedo || !audit.actual?.explicitCopySave || !audit.actual?.responsive960x720 || audit.actual?.runtimeErrors !== 0) failures.push('desktop workflow')
if (!audit.decision?.m1cClosed || audit.decision?.nextStage !== 'M1D-media-and-structured-text-selection-audit') failures.push('stage decision')
if (!audit.decision?.formulaEditingRemainsReadOnly || audit.decision?.customStyleCreation !== false || !audit.decision?.odpRemainsReadOnly) failures.push('closed boundaries')
for (const token of ['build_ods_cell_style_patch_isolated', 'OdsNamedCellStyle', 'expected_style_digest', 'unchanged_parts_verified']) {
  if (!backend.includes(token)) failures.push(`backend token: ${token}`)
}
for (const token of ['save_ods_cell_style_copy', 'write_new_bytes', '禁止覆盖源文件']) {
  if (!command.includes(token)) failures.push(`command token: ${token}`)
}
for (const token of ['m1cd-ods-style-controls', 'styleDraft', 'odsCellStyle', "invoke<OdsSavedCopyReport>('save_ods_cell_style_copy'"]) {
  if (!view.includes(token)) failures.push(`view token: ${token}`)
}
const ods = formats.formats.find((format) => format.id === 'ods')
if (ods?.userCapability?.level !== 'basic-edit' || ods?.userCapability?.saveMode !== 'copy' || !ods?.userCapability?.description?.includes('已有命名样式')) failures.push('public ODS capability')
for (const file of audit.evidenceFiles ?? []) {
  if (!fs.existsSync(`docs/evidence/post-v115-m1cd-ods-style-edit/${file}`)) failures.push(`missing evidence: ${file}`)
}

if (failures.length) {
  console.error(`M1C-D contract failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('M1C-D ODS existing named style contract passed.')
