import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const opml = registry.formats.find(format => format.id === 'opml')
if (!opml || opml.externalPolicy !== 'edit' || opml.routeName !== 'MindMap'
  || opml.capabilities.edit !== 'supported' || opml.adapters.writer !== 'opml'
  || opml.userCapability.saveMode !== 'overwrite' || opml.maxBytes !== 8 * 1024 * 1024
  || JSON.stringify(opml.extensions) !== JSON.stringify(['.opml'])) {
  failures.push('OPML must expose its bounded dedicated mind-map editor through the external route')
}
const counts = registry.formats.reduce((result, format) => {
  result[format.externalPolicy] = (result[format.externalPolicy] || 0) + 1
  return result
}, {})
if (counts.edit !== 29 || counts.preview !== 8 || counts.import !== 6) {
  failures.push(`EA-4D3 policy counts drift: ${JSON.stringify(counts)}`)
}
for (const id of ['legacy-doc', 'legacy-xls', 'legacy-ppt', 'wps-document', 'wps-spreadsheet', 'wps-presentation']) {
  if (registry.formats.find(format => format.id === id)?.externalPolicy !== 'import') {
    failures.push(`${id} must remain an explicit conversion or system-open workflow`)
  }
}

const backend = read('src-tauri/src/commands/mindmap.rs')
const formatCommands = read('src-tauri/src/commands/formats.rs')
const formatKernel = read('src-tauri/src/formats/opml.rs')
const view = read('src/views/MindMapView.vue')
const access = read('src-tauri/src/services/external_file_access.rs')
const lib = read('src-tauri/src/lib.rs')
for (const token of [
  'pub async fn read_external_opml_file',
  'pub async fn write_external_opml_file',
  'read_external_opml_file_with_access',
  'write_external_opml_file_with_access',
  'serialize_opml(&document)',
  'external-not-authorized',
  'invalid-opml-document',
  'external-modified',
  'external_opml_requires_authorization_preserves_metadata_and_rejects_conflicts',
]) requireText(backend, token, `external OPML backend is missing ${token}`)
for (const token of ['MAX_OPML_BYTES', 'OPML 文件不能超过 8 MB', 'external-opml-read-failed']) {
  requireText(backend, token, `OPML source boundary is missing ${token}`)
}
for (const token of [
  'MAX_OPML_NODES: usize = 10_000',
  'const MAX_OPML_DEPTH: usize = 64',
  'Event::DocType(_) => return Err("OPML 不允许包含 DTD".into())',
  'attributes: BTreeMap<String, String>',
  'metadata: BTreeMap<String, String>',
  'validate_opml(document)?',
]) requireText(formatKernel, token, `OPML XML preservation or safety kernel is missing ${token}`)
for (const token of ['| "log"\n            | "drawio"\n            | "diagram"\n            | "opml"', 'specialized-writer-required']) {
  requireText(formatCommands, token, `generic writer boundary is missing ${token}`)
}
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "isExternal.value ? 'read_external_opml_file' : 'read_opml_file'",
  "isExternal.value ? 'write_external_opml_file' : 'write_opml_file'",
  '覆盖外部 OPML 源文件？',
  '外部 OPML · 仅点击保存写回',
  "cause?.code === 'external-modified'",
  'v-if="!isExternal" title="投影到 Canvas"',
  'watch([path, isExternal, () => route.query.node]',
  '@pointerdown.stop="startNodePointer($event, item.node.id)"',
  '@wheel.prevent="onMapWheel"',
  'const undo =',
  'const redo =',
]) requireText(view, token, `external OPML workspace is missing ${token}`)
requireText(access, 'let opml_file = directory.join("mindmap.opml")', 'external OPML authorization regression is missing')
for (const token of ['read_external_opml_file', 'write_external_opml_file']) {
  requireText(lib, token, `Tauri registry is missing ${token}`)
}

const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-4D3 must not add OPML installer associations')
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-4D3 external OPML workspace passed: bounded XML semantics, professional canvas editing, guarded explicit save and unchanged Windows associations are aligned.')
