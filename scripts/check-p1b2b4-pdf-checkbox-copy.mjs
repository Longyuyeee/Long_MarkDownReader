import crypto from 'node:crypto'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const engine = read('src-tauri/src/formats/pdf_form_fill.rs')
const inspector = read('src-tauri/src/formats/pdf_forms.rs')
const commands = read('src-tauri/src/commands/pdf.rs')
const lib = read('src-tauri/src/lib.rs')
const panel = read('src/components/pdf/PdfFormInspectorPanel.vue')
const contract = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const evidenceRoot = 'docs/evidence/p1b2b4-pdf-checkbox-copy'
const manifest = JSON.parse(read(`${evidenceRoot}/manifest.json`))
const evidence = JSON.parse(read(`${evidenceRoot}/runtime-evidence.json`))

for (const token of ['checkbox_export_value', 'widget_states_written', 'b"AS"', 'writes_checkbox_export_value_and_widget_appearance_state']) if (!engine.includes(token)) fail(`P1-B2B4 checkbox engine marker missing: ${token}`)
for (const token of ['button_kind', 'button_export_values', 'normal_appearance_states', 'appearance_state', 'appearance_states']) if (!inspector.includes(token)) fail(`P1-B2B4 inspector marker missing: ${token}`)
for (const token of ['preview_pdf_form_copy', 'save_pdf_form_copy']) {
  if (!commands.includes(token) || !lib.includes(token)) fail(`P1-B2B4 command registration missing: ${token}`)
}
for (const token of ['data-capability="p1b2b4-checkbox-copy"', 'type="checkbox"', "field.buttonKind === 'checkbox'", "appearanceStates.includes('Off')", '表单可靠副本', '按钮状态']) if (!panel.includes(token)) fail(`P1-B2B4 workspace marker missing: ${token}`)
if (!['P1-B2B4', 'P1-B2B5', 'P1-B2B6', 'P1-B3A', 'P1-B3B', 'P1-B3C', 'P1-B3D', 'P1-B4A', 'P1-B4B', 'P1-B4C', 'P1-B4D', 'P1-B5A'].includes(contract.stage) || !['checkbox-form-copy-complete', 'radio-form-copy-complete', 'single-choice-form-copy-complete', 'permanent-redaction-safety-audit-complete', 'permanent-redaction-backend-complete', 'permanent-redaction-workspace-complete', 'permanent-redaction-complete', 'watermark-safety-audit-complete', 'watermark-backend-complete', 'watermark-workspace-complete', 'watermark-complete', 'metadata-safety-audit-complete'].includes(contract.status) || !contract.currentCapabilities?.includes('bounded-checkbox-form-copy')) fail('P1-B2B4 contract lineage is stale')
if (!['checkbox-complete-radio-choice-pending', 'radio-complete-choice-pending', 'safe-standard-fields-complete'].includes(contract.plannedSlices?.find(item => item.id === 'P1-B2B')?.status)) fail('P1-B2B4 next-slice lineage is stale')
if (manifest.stage !== 'P1-B2B4' || manifest.status !== 'accepted' || manifest.screenshots?.length !== 3 || manifest.sourceUserContentIncluded !== false) fail('P1-B2B4 manifest invalid')
for (const screenshot of manifest.screenshots) {
  const bytes = fs.readFileSync(`${evidenceRoot}/${screenshot.file}`)
  if (bytes.length !== screenshot.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) fail(`P1-B2B4 screenshot integrity failed: ${screenshot.file}`)
}
const sourceRender = fs.readFileSync(`${evidenceRoot}/checkbox-pdf-poppler-source.png`)
const targetRender = fs.readFileSync(`${evidenceRoot}/checkbox-pdf-poppler.png`)
if (sourceRender.length < 10_000 || targetRender.length < 10_000 || crypto.createHash('sha256').update(sourceRender).digest('hex') === crypto.createHash('sha256').update(targetRender).digest('hex')) fail('P1-B2B4 independent render evidence invalid')
if (!evidence.passed || !evidence.sourceUnchanged || evidence.runtimeErrorCount !== 0 || evidence.reopened?.fieldValue !== 'Yes' || evidence.reopened?.buttonKind !== 'checkbox' || evidence.reopened?.buttonExportValues?.join(',') !== 'Yes' || evidence.reopened?.appearanceState !== 'Yes' || evidence.reopened?.appearanceStates?.join(',') !== 'Off,Yes' || evidence.render?.darkPixels <= evidence.sourceRender?.darkPixels + 5 || !evidence.render?.hasInkInField) fail('P1-B2B4 runtime evidence invalid')
for (const viewport of [evidence.wide, evidence.narrow]) if (!viewport.integrated || !viewport.checkboxChecked || !viewport.hasVerified || !viewport.hasNoOverwrite || !viewport.saveReachable || viewport.errorVisible || viewport.overflow > 2 || viewport.panel?.width < 260) fail('P1-B2B4 responsive evidence invalid')

console.log('P1-B2B4 PDF checkbox copy passed: bounded export state, canonical field value, widget appearance state, source safety, desktop workflow, reopen and independent render evidence are accepted.')
