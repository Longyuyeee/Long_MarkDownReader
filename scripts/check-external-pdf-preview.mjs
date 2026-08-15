import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const pdf = registry.formats.find(format => format.id === 'pdf')
if (!pdf || pdf.externalPolicy !== 'preview' || pdf.routeName !== 'Pdf' || pdf.capabilities.edit !== 'supported'
  || pdf.adapters.writer !== 'pdf-copy' || pdf.userCapability.saveMode !== 'copy') {
  failures.push('PDF must expose library-only reliable copies while external preview remains read-only')
}

const backend = read('src-tauri/src/commands/pdf.rs')
const view = read('src/views/PdfView.vue')
const transport = read('src/utils/tauriPdfRangeTransport.ts')
const lib = read('src-tauri/src/lib.rs')
for (const token of [
  'pub async fn read_external_pdf_info',
  'pub async fn read_external_pdf_range',
  'access.resolve_preview(path)?',
  'ensure_pdf_format(&file_path)?',
  'read_pdf_info_from_path',
  'read_pdf_range_from_path',
]) requireText(backend, token, `external PDF backend is missing ${token}`)
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "isExternal.value ? 'read_external_pdf_info' : 'read_pdf_info'",
  'v-if="!isExternal"',
  '外部文件 · 只读 · ',
  '· 不会写回',
  'external: isExternal.value',
  'if (!isExternal.value) initializePagePlan',
  'if (!isExternal.value) {',
]) requireText(view, token, `external PDF workspace is missing ${token}`)
for (const token of [
  "this.options.external ? 'read_external_pdf_range' : 'read_pdf_range'",
  '...(this.options.external ? {} : { libraryRoot: this.options.libraryRoot })',
]) requireText(transport, token, `PDF range transport is missing ${token}`)
for (const token of ['read_external_pdf_info', 'read_external_pdf_range']) {
  requireText(lib, token, `Tauri command registry is missing ${token}`)
}

const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-3B must not add PDF installer associations')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-3B external PDF preview passed: authorized range reading, library-only sidecars and page operations, zero PDF association takeover.')
