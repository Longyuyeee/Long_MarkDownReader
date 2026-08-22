import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const docx = registry.formats.find(format => format.id === 'docx')
if (!docx || docx.externalPolicy !== 'preview' || docx.routeName !== 'DocxEditor'
  || docx.capabilities.edit !== 'supported' || docx.adapters.writer !== 'docx'
  || docx.userCapability.saveMode !== 'bounded-overwrite') {
  failures.push('DOCX must retain library editing while exposing a separate external read-only preview')
}
const backend = read('src-tauri/src/commands/docx.rs')
const access = read('src-tauri/src/services/external_file_access.rs')
const view = read('src/views/DocxReaderView.vue')
const lib = read('src-tauri/src/lib.rs')
for (const token of [
  'pub async fn read_external_docx_document',
  'access.resolve_preview(path)?',
  'ensure_docx_format(&document)?',
  'report.editable_text_targets.clear()',
  'report.editable_style_targets.clear()',
  'report.editable_image_targets.clear()',
  'let source_preserved = source == after',
]) requireText(backend, token, `external DOCX backend is missing ${token}`)
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "requestedExternal ? 'read_external_docx_document' : 'read_docx_document'",
  '...(requestedExternal ? {} : { libraryRoot: store.libraryPath })',
  'v-if="!isExternal"',
  'editorOpen && !isExternal',
  'editorOpen && !isExternal',
  'external: requestedExternal',
  '外部 Word 文档 · 只读 · 不会写回',
  '<WorkspaceTabs v-if="isExternal',
]) requireText(view, token, `external DOCX workspace is missing ${token}`)
requireText(access, 'resolve_preview(&document)', 'external DOCX preview authorization regression is missing')
requireText(lib, 'read_external_docx_document', 'Tauri command registry is missing external DOCX reading')

const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-3E must not add a DOCX installer association')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-3E external DOCX preview passed: external reads expose no edit targets or save UI, and library editing remains intact.')
