import fs from 'node:fs'

const view = fs.readFileSync('src/views/PdfView.vue', 'utf8')
const panel = fs.readFileSync('src/components/pdf/PdfFormInspectorPanel.vue', 'utf8')
const evidence = JSON.parse(fs.readFileSync('docs/evidence/p1b2a2-pdf-form-panel/runtime-evidence.json', 'utf8'))
const manifest = JSON.parse(fs.readFileSync('docs/evidence/p1b2a2-pdf-form-panel/manifest.json', 'utf8'))
const fail = message => { console.error(message); process.exit(1) }

for (const token of ["sidebarTab === 'forms'", 'inspect_pdf_form_structure', 'PdfFormInspectorPanel', "isExternal.value || !pdfDocument.value", "availableSidebarTabs = isExternal.value ? ['thumbnails', 'outline']"]) {
  if (!view.includes(token)) fail(`P1-B2A2 integrated PDF workspace marker is missing: ${token}`)
}
for (const token of ['renderLimit = 300', '密码值已隐藏', '没有填写、保存或覆盖入口', 'sourceDigest.slice', 'fieldWidgets(field.name)']) {
  if (!panel.includes(token)) fail(`P1-B2A2 form panel marker is missing: ${token}`)
}
if (manifest.stage !== 'P1-B2A2' || manifest.status !== 'accepted' || manifest.sourceUserContentIncluded !== false || manifest.screenshots?.length !== 2) fail('P1-B2A2 manifest is invalid')
if (!evidence.passed || !evidence.sourceUnchanged || evidence.runtimeErrorCount !== 0 || evidence.sourceUserContentIncluded !== false) fail('P1-B2A2 runtime evidence is invalid')
if (evidence.report?.status !== 'inspectable' || evidence.report?.fieldCount !== 2 || evidence.report?.widgetCount !== 2) fail('P1-B2A2 AcroForm report was not desktop verified')
for (const viewport of [evidence.wide, evidence.narrow]) {
  if (!viewport?.integrated || !viewport.hasSummary || !viewport.hasReadOnlyBoundary || viewport.hasWriteAction || viewport.errorVisible || viewport.overflow > 2 || viewport.panel?.width < 260) fail('P1-B2A2 responsive integrated panel evidence failed')
}

console.log('P1-B2A2 PDF form panel passed: the original PDF workspace exposes bounded read-only AcroForm inspection with accepted wide and narrow Tauri evidence.')
