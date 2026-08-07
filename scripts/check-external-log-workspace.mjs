import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const log = registry.formats.find(format => format.id === 'log')
if (!log || log.externalPolicy !== 'edit' || log.routeName !== 'LogViewer'
  || log.capabilities.edit !== 'supported' || log.adapters.writer !== 'text'
  || log.userCapability.saveMode !== 'overwrite') {
  failures.push('LOG must expose guarded external editing without weakening its library contract')
}

for (const id of ['canvas', 'table', 'drawio', 'diagram', 'opml']) {
  if (registry.formats.find(format => format.id === id)?.externalPolicy !== 'import') {
    failures.push(`${id} must remain import-only until its specialized workspace is audited`)
  }
}
for (const id of ['legacy-doc', 'legacy-xls', 'legacy-ppt', 'wps-document', 'wps-spreadsheet', 'wps-presentation']) {
  if (registry.formats.find(format => format.id === id)?.externalPolicy !== 'import') {
    failures.push(`${id} must remain an explicit conversion or system-open workflow`)
  }
}

const backend = read('src-tauri/src/commands/formats.rs')
const view = read('src/views/LogViewerView.vue')
const access = read('src-tauri/src/services/external_file_access.rs')
const lib = read('src-tauri/src/lib.rs')
for (const token of [
  'pub async fn write_external_log_document',
  'write_external_log_document_with_access',
  'validate_log_write(&content, acknowledged_overwrite)?',
  '"json" | "jsonc" | "yaml" | "xml" | "svg" | "toml" | "log"',
  'write_external_registered_text_document(',
  'log-overwrite-not-acknowledged',
  'log-edit-too-large',
  'external_log_writer_requires_authorization_and_preserves_conflicting_sources',
  'external-not-authorized',
  'external-modified',
]) requireText(backend, token, `external LOG backend is missing ${token}`)
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "isExternal.value ? 'read_external_text_document_range' : 'read_text_document_range'",
  "isExternal.value ? 'read_external_text_document' : 'read_text_document'",
  "isExternal.value ? 'write_external_log_document' : 'write_log_document'",
  '...(isExternal.value ? {} : { libraryRoot: store.libraryPath })',
  'external: isExternal.value',
  'watch([logPath, isExternal]',
  'acknowledgedOverwrite: true',
]) requireText(view, token, `external LOG workspace is missing ${token}`)
requireText(access, 'let log_file = directory.join("application.log")', 'external LOG editable authorization regression is missing')
requireText(lib, 'write_external_log_document', 'Tauri registry is missing the external LOG writer')

const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-4A must not add a LOG installer association')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-4A external LOG workspace passed: bounded viewer, explicit guarded save, authorization and source-conflict protection are aligned.')
