import crypto from 'node:crypto'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const inspector = read('src-tauri/src/formats/pdf_forms.rs')
const engine = read('src-tauri/src/formats/pdf_form_fill.rs')
const panel = read('src/components/pdf/PdfFormInspectorPanel.vue')
const fixture = read('scripts/create-p1b2b6-pdf-choice-fixture.mjs')
const contract = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const evidenceRoot = 'docs/evidence/p1b2b6-pdf-choice-copy'
const manifest = JSON.parse(read(`${evidenceRoot}/manifest.json`))
const evidence = JSON.parse(read(`${evidenceRoot}/runtime-evidence.json`))

for (const token of ['PdfChoiceOptionSummary', 'choice_options', 'selected_indices', '1 << 17', '1 << 18', '1 << 21']) if (!inspector.includes(token)) fail(`P1-B2B6 inspector marker missing: ${token}`)
for (const token of ['choice_option_for_value', 'writes_single_choice_export_index_and_display_appearance', '可自由输入或多选字段不能可靠填写', '导出值重复']) if (!engine.includes(token)) fail(`P1-B2B6 choice engine marker missing: ${token}`)
for (const token of ['data-current-capability="p1b2b6-choice-copy"', 'form-choice-edit', 'option.exportValue', 'option.displayValue', 'field.choiceEditable', 'field.choiceMultiSelect']) if (!panel.includes(token)) fail(`P1-B2B6 workspace marker missing: ${token}`)
for (const token of ['/Ff 131072', '/I [0]', '/Opt [[(region-north) (Northwest Operations)]', '(region-east) (East)']) if (!fixture.includes(token)) fail(`P1-B2B6 fixture marker missing: ${token}`)
if (!['P1-B2B6', 'P1-B3A', 'P1-B3B', 'P1-B3C', 'P1-B3D', 'P1-B4A', 'P1-B4B'].includes(contract.stage) || !['single-choice-form-copy-complete', 'permanent-redaction-safety-audit-complete', 'permanent-redaction-backend-complete', 'permanent-redaction-workspace-complete', 'permanent-redaction-complete', 'watermark-safety-audit-complete', 'watermark-backend-complete'].includes(contract.status) || !contract.currentCapabilities?.includes('bounded-single-choice-form-copy')) fail('P1-B2B6 contract is stale')
if (contract.plannedSlices?.find(item => item.id === 'P1-B2B')?.status !== 'safe-standard-fields-complete') fail('P1-B2B6 AcroForm boundary is stale')
if (!contract.notPlanned?.includes('editable-choice-free-text-writeback') || !contract.notPlanned?.includes('multi-select-choice-writeback')) fail('P1-B2B6 advanced Choice blockers are missing')
if (manifest.stage !== 'P1-B2B6' || manifest.status !== 'accepted' || manifest.screenshots?.length !== 3 || manifest.sourceUserContentIncluded !== false) fail('P1-B2B6 manifest invalid')
for (const screenshot of manifest.screenshots) {
  const bytes = fs.readFileSync(`${evidenceRoot}/${screenshot.file}`)
  if (bytes.length !== screenshot.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) fail(`P1-B2B6 screenshot integrity failed: ${screenshot.file}`)
}
const sourceRender = fs.readFileSync(`${evidenceRoot}/choice-pdf-poppler-source.png`)
const targetRender = fs.readFileSync(`${evidenceRoot}/choice-pdf-poppler.png`)
if (sourceRender.length < 10_000 || targetRender.length < 10_000 || crypto.createHash('sha256').update(sourceRender).digest('hex') === crypto.createHash('sha256').update(targetRender).digest('hex')) fail('P1-B2B6 independent render evidence invalid')
const options = evidence.reopened?.choiceOptions || []
if (!evidence.passed || !evidence.sourceUnchanged || evidence.runtimeErrorCount !== 0 || evidence.reopened?.fieldValue !== 'region-east' || evidence.reopened?.choiceKind !== 'combo' || evidence.reopened?.choiceEditable || evidence.reopened?.choiceMultiSelect || options.length !== 3 || options[1]?.exportValue !== 'region-east' || options[1]?.displayValue !== 'East' || evidence.reopened?.selectedIndices?.join(',') !== '1' || !evidence.reopened?.hasNormalAppearance || evidence.sourceRender?.darkPixels < evidence.render?.darkPixels + 20) fail('P1-B2B6 runtime evidence invalid')
for (const viewport of [evidence.wide, evidence.narrow]) if (!viewport.integrated || viewport.optionCount !== 3 || viewport.selectedValue !== 'region-east' || viewport.selectedText !== 'East' || !viewport.hasVerified || !viewport.hasNoOverwrite || !viewport.saveReachable || viewport.errorVisible || viewport.overflow > 2 || viewport.panel?.width < 260) fail('P1-B2B6 responsive evidence invalid')

console.log('P1-B2B6 PDF Choice copy passed: bounded export/display options, canonical value/index, source safety, desktop workflow, reopen and independent render evidence are accepted.')
