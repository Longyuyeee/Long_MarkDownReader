import crypto from 'node:crypto'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const engine = read('src-tauri/src/formats/pdf_form_fill.rs')
const panel = read('src/components/pdf/PdfFormInspectorPanel.vue')
const fixture = read('scripts/create-p1b2b5-pdf-radio-fixture.mjs')
const contract = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const evidenceRoot = 'docs/evidence/p1b2b5-pdf-radio-copy'
const manifest = JSON.parse(read(`${evidenceRoot}/manifest.json`))
const evidence = JSON.parse(read(`${evidenceRoot}/runtime-evidence.json`))

for (const token of ['button_widget_export_states', 'expected_button_widget_states', '导出状态必须唯一', 'writes_mutually_exclusive_radio_widget_states']) if (!engine.includes(token)) fail(`P1-B2B5 radio engine marker missing: ${token}`)
for (const token of ['data-stage-capability="p1b2b5-radio-copy"', 'type="radio"', "field.buttonKind !== 'radio'", 'new Set(options)', '单选组与有界单选 Choice']) if (!panel.includes(token)) fail(`P1-B2B5 workspace marker missing: ${token}`)
for (const token of ['/Ff 32768', '/Kids [8 0 R 9 0 R]', '/Standard', '/Professional']) if (!fixture.includes(token)) fail(`P1-B2B5 fixture marker missing: ${token}`)
if (!['P1-B2B5', 'P1-B2B6', 'P1-B3A', 'P1-B3B', 'P1-B3C', 'P1-B3D', 'P1-B4A'].includes(contract.stage) || !['radio-form-copy-complete', 'single-choice-form-copy-complete', 'permanent-redaction-safety-audit-complete', 'permanent-redaction-backend-complete', 'permanent-redaction-workspace-complete', 'permanent-redaction-complete', 'watermark-safety-audit-complete'].includes(contract.status) || !contract.currentCapabilities?.includes('bounded-radio-form-copy')) fail('P1-B2B5 contract is stale')
if (!['radio-complete-choice-pending', 'safe-standard-fields-complete'].includes(contract.plannedSlices?.find(item => item.id === 'P1-B2B')?.status)) fail('P1-B2B5 next-slice boundary is stale')
if (manifest.stage !== 'P1-B2B5' || manifest.status !== 'accepted' || manifest.screenshots?.length !== 3 || manifest.sourceUserContentIncluded !== false) fail('P1-B2B5 manifest invalid')
for (const screenshot of manifest.screenshots) {
  const bytes = fs.readFileSync(`${evidenceRoot}/${screenshot.file}`)
  if (bytes.length !== screenshot.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) fail(`P1-B2B5 screenshot integrity failed: ${screenshot.file}`)
}
const sourceRender = fs.readFileSync(`${evidenceRoot}/radio-pdf-poppler-source.png`)
const targetRender = fs.readFileSync(`${evidenceRoot}/radio-pdf-poppler.png`)
if (sourceRender.length < 10_000 || targetRender.length < 10_000 || crypto.createHash('sha256').update(sourceRender).digest('hex') === crypto.createHash('sha256').update(targetRender).digest('hex')) fail('P1-B2B5 independent render evidence invalid')
const widgets = evidence.reopened?.widgetStates || []
if (!evidence.passed || !evidence.sourceUnchanged || evidence.runtimeErrorCount !== 0 || evidence.reopened?.fieldValue !== 'Professional' || evidence.reopened?.buttonKind !== 'radio' || evidence.reopened?.buttonExportValues?.join(',') !== 'Professional,Standard' || widgets.length !== 2 || !widgets.some(widget => widget.appearanceState === 'Off' && widget.appearanceStates?.includes('Standard')) || !widgets.some(widget => widget.appearanceState === 'Professional' && widget.appearanceStates?.includes('Professional')) || evidence.render?.professional?.darkPixels <= evidence.sourceRender?.professional?.darkPixels + 5 || evidence.render?.standard?.darkPixels + 5 >= evidence.sourceRender?.standard?.darkPixels) fail('P1-B2B5 runtime evidence invalid')
for (const viewport of [evidence.wide, evidence.narrow]) if (!viewport.integrated || viewport.radioCount !== 2 || viewport.selectedValue !== 'Professional' || !viewport.hasVerified || !viewport.hasNoOverwrite || !viewport.saveReachable || viewport.errorVisible || viewport.overflow > 2 || viewport.panel?.width < 260) fail('P1-B2B5 responsive evidence invalid')

console.log('P1-B2B5 PDF radio copy passed: unique widget exports, mutually exclusive appearance states, source safety, desktop workflow, reopen and independent render evidence are accepted.')
