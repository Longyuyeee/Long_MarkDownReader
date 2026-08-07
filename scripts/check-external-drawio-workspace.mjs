import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const drawio = registry.formats.find(format => format.id === 'drawio')
if (!drawio || drawio.externalPolicy !== 'edit' || drawio.routeName !== 'DrawioEditor'
  || drawio.capabilities.edit !== 'supported' || drawio.adapters.writer !== 'text'
  || drawio.userCapability.saveMode !== 'overwrite' || drawio.maxBytes !== 10 * 1024 * 1024) {
  failures.push('Draw.io must expose its bounded structured editor through a dedicated external route')
}
const counts = registry.formats.reduce((result, format) => {
  result[format.externalPolicy] = (result[format.externalPolicy] || 0) + 1
  return result
}, {})
if (counts.edit !== 28 || counts.preview !== 8 || counts.import !== 7) {
  failures.push(`EA-4D1 policy counts drift: ${JSON.stringify(counts)}`)
}
for (const id of ['opml']) {
  if (registry.formats.find(format => format.id === id)?.externalPolicy !== 'import') {
    failures.push(`${id} must remain import-only until its specialized workspace is audited`)
  }
}

const backend = read('src-tauri/src/commands/drawio.rs')
const formatCommands = read('src-tauri/src/commands/formats.rs')
const formatKernel = read('src-tauri/src/formats/drawio.rs')
const view = read('src/views/DrawioEditorView.vue')
const access = read('src-tauri/src/services/external_file_access.rs')
const lib = read('src-tauri/src/lib.rs')
for (const token of [
  'pub async fn write_external_drawio_source_document',
  'write_external_drawio_source_document_with_access',
  'write_external_registered_text_document(',
  'validate_save(&content)?',
  'unsafe-drawio-save-blocked',
  'external_drawio_requires_authorization_and_preserves_conflicting_sources',
  'external-not-authorized',
  'external-modified',
]) requireText(backend, token, `external Draw.io backend is missing ${token}`)
for (const token of ['"log" | "drawio"', 'specialized-writer-required']) {
  requireText(formatCommands, token, `generic external writer boundary is missing ${token}`)
}
for (const token of ['external-image-not-loaded', 'MAX_TOTAL_PAGE_BYTES', 'unsafe-resource-scheme']) {
  requireText(formatKernel, token, `Draw.io resource isolation is missing ${token}`)
}
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "isExternal.value ? 'read_external_text_document' : 'read_text_document'",
  "invoke<Snapshot>('write_external_drawio_source_document'",
  '覆盖外部 Draw.io 源文件？',
  '外部 Draw.io · 仅点击保存写回',
  'external: isExternal.value',
  "error?.code === 'external-modified'",
  'watch([documentPath, isExternal]',
  'externalImageCount',
]) requireText(view, token, `external Draw.io workspace is missing ${token}`)
requireText(access, 'let drawio_file = directory.join("diagram.drawio")', 'external Draw.io authorization regression is missing')
requireText(lib, 'write_external_drawio_source_document', 'Tauri registry is missing external Draw.io writing')

const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-4D1 must not add Draw.io installer associations')
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-4D1 external Draw.io workspace passed: bounded local projection, guarded explicit save, resource isolation and unchanged Windows associations are aligned.')
