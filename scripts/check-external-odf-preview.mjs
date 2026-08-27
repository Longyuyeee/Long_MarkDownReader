import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
for (const id of ['ods', 'odp']) {
  const format = registry.formats.find(item => item.id === id)
  if (!format || format.externalPolicy !== 'preview' || format.routeName !== 'OdfReader') {
    failures.push(`${id} must remain an externally read-only OdfReader format`)
  }
}
const odp = registry.formats.find(item => item.id === 'odp')
if (odp?.capabilities.edit !== 'unsupported' || odp?.adapters.writer !== null || odp?.userCapability.saveMode !== 'none') {
  failures.push('odp must remain globally read-only')
}

const backend = read('src-tauri/src/commands/odf_content.rs')
const view = read('src/views/OdfContentReaderView.vue')
const lib = read('src-tauri/src/lib.rs')
for (const token of [
  'pub async fn read_external_odf_content_document',
  'access.resolve_preview(path)?',
  'ensure_odf_content_format(&document)?',
  'read_odf_content_path(&document, false)',
  'let source_preserved = before == after',
  '["ods", "odp"].contains(&format.id.as_str())',
]) requireText(backend, token, `external ODF backend is missing ${token}`)
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "isExternal.value ? 'read_external_odf_content_document' : 'read_odf_content_document'",
  '...(isExternal.value ? {} : { libraryRoot: store.libraryPath })',
  'external: isExternal.value',
  '外部文件 · ',
  ' · 不会写回',
  '<WorkspaceTabs v-if="isExternal',
  "router.push({ name: 'LibraryMode' })",
]) requireText(view, token, `external ODF workspace is missing ${token}`)
requireText(lib, 'read_external_odf_content_document', 'Tauri command registry is missing the external ODF command')

const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-3C must not add ODS or ODP installer associations')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-3C external ODF preview passed: ODS/ODP use authorized read-only parsing, preserve source bytes, and add no file associations.')
