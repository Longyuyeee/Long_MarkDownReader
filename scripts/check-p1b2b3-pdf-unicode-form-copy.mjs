import fs from 'node:fs'
import crypto from 'node:crypto'

const read = path => fs.readFileSync(path, 'utf8')
const engine = read('src-tauri/src/formats/pdf_form_fill.rs')
const inspector = read('src-tauri/src/formats/pdf_forms.rs')
const panel = read('src/components/pdf/PdfFormInspectorPanel.vue')
const contract = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const manifest = JSON.parse(read('docs/evidence/p1b2b3-pdf-unicode-form-copy/manifest.json'))
const evidence = JSON.parse(read('docs/evidence/p1b2b3-pdf-unicode-form-copy/runtime-evidence.json'))
const fail = message => { console.error(message); process.exit(1) }
const font = fs.readFileSync('src-tauri/assets/fonts/NotoSansCJKsc-Regular.otf')
if (crypto.createHash('sha256').update(font).digest('hex') !== '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b') fail('P1-B2B3 bundled font digest changed')
if (!read('src-tauri/assets/fonts/OFL-1.1.txt').includes('SIL OPEN FONT LICENSE Version 1.1')) fail('P1-B2B3 font license is missing')

for (const token of ['NotoSansCJKsc-Regular.otf', 'GlyphRemapper', 'CIDFontType0', 'Identity-H', 'ToUnicode', 'pdf_text_string', '[0xfe, 0xff]', 'writes_unicode_value_with_subset_font_and_blocks_unsafe_inputs']) if (!engine.includes(token)) fail(`P1-B2B3 Unicode engine marker missing: ${token}`)
for (const token of ['decode_pdf_text_string', '0xfe, 0xff', 'from_utf16_lossy']) if (!inspector.includes(token)) fail(`P1-B2B3 inspector marker missing: ${token}`)
for (const token of ['支持中文', '源 PDF 和已有文件不会覆盖']) if (!panel.includes(token)) fail(`P1-B2B3 UI boundary missing: ${token}`)
if (!['P1-B2B3', 'P1-B2B4', 'P1-B2B5'].includes(contract.stage) || !['unicode-text-form-copy-complete', 'checkbox-form-copy-complete', 'radio-form-copy-complete'].includes(contract.status)) fail('P1-B2B3 contract lineage is stale')
if (manifest.stage !== 'P1-B2B3' || manifest.status !== 'accepted' || manifest.screenshots?.length !== 3 || manifest.sourceUserContentIncluded !== false) fail('P1-B2B3 manifest invalid')
const poppler = fs.readFileSync('docs/evidence/p1b2b3-pdf-unicode-form-copy/unicode-pdf-poppler.png')
if (crypto.createHash('sha256').update(poppler).digest('hex') !== 'e92f41275d05d86d175cccd5a422962788b9c0304c62dba687e7fe7a78e73313') fail('P1-B2B3 Poppler render evidence changed')
if (!evidence.passed || !evidence.sourceUnchanged || evidence.runtimeErrorCount !== 0 || evidence.reopened?.fieldValue !== '中文编辑 QA' || !evidence.reopened?.hasNormalAppearance || !evidence.render?.hasInkInField || evidence.targetBytes >= 1_000_000) fail('P1-B2B3 runtime evidence invalid')
for (const viewport of [evidence.wide, evidence.narrow]) if (!viewport.integrated || !viewport.hasVerified || !viewport.hasNoOverwrite || !viewport.saveReachable || viewport.errorVisible || viewport.overflow > 2 || viewport.panel?.width < 260) fail('P1-B2B3 responsive evidence invalid')
console.log('P1-B2B3 PDF Unicode form copy passed: licensed subset font, UTF-16 field value, live desktop workflow, reopen and rendered glyph evidence are accepted.')
