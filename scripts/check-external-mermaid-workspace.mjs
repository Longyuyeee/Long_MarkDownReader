import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const diagram = registry.formats.find(format => format.id === 'diagram')
if (!diagram || diagram.externalPolicy !== 'edit' || diagram.routeName !== 'Diagram'
  || diagram.capabilities.edit !== 'supported' || diagram.adapters.writer !== 'diagram'
  || diagram.userCapability.saveMode !== 'overwrite' || diagram.maxBytes !== 2 * 1024 * 1024
  || JSON.stringify(diagram.extensions) !== JSON.stringify(['.mmd', '.mermaid'])) {
  failures.push('Mermaid must expose its bounded dedicated editor through the external Diagram route')
}
const counts = registry.formats.reduce((result, format) => {
  result[format.externalPolicy] = (result[format.externalPolicy] || 0) + 1
  return result
}, {})
if (counts.edit !== 28 || counts.preview !== 8 || counts.import !== 7) {
  failures.push(`EA-4D2 policy counts drift: ${JSON.stringify(counts)}`)
}
if (registry.formats.find(format => format.id === 'opml')?.externalPolicy !== 'import') {
  failures.push('OPML must remain import-only until EA-4D3 audits its specialized workspace')
}

const backend = read('src-tauri/src/commands/diagram.rs')
const formatCommands = read('src-tauri/src/commands/formats.rs')
const formatKernel = read('src-tauri/src/formats/diagram.rs')
const view = read('src/views/DiagramStudio.vue')
const access = read('src-tauri/src/services/external_file_access.rs')
const lib = read('src-tauri/src/lib.rs')
for (const token of [
  'pub async fn read_external_diagram_file',
  'pub async fn write_external_diagram_file',
  'read_external_diagram_file_with_access',
  'write_external_diagram_file_with_access',
  'validate_mermaid_source(&content)',
  'external-not-authorized',
  'invalid-mermaid-source',
  'external-modified',
  'external_diagram_requires_authorization_and_preserves_conflicting_sources',
]) requireText(backend, token, `external Mermaid backend is missing ${token}`)
for (const token of ['MAX_DIAGRAM_BYTES', 'Mermaid 源码不能超过 2 MB', 'Mermaid 文件必须使用 UTF-8 编码']) {
  requireText(backend, token, `Mermaid source boundary is missing ${token}`)
}
for (const token of ['MAX_DIAGRAM_BYTES: usize = 2 * 1024 * 1024', 'validate_mermaid_source']) {
  requireText(formatKernel, token, `Mermaid validation kernel is missing ${token}`)
}
for (const token of ['"log" | "drawio" | "diagram"', 'specialized-writer-required']) {
  requireText(formatCommands, token, `generic writer boundary is missing ${token}`)
}
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "isExternal.value ? 'read_external_diagram_file' : 'read_diagram_file'",
  "isExternal.value ? 'write_external_diagram_file' : 'write_diagram_file'",
  '覆盖外部 Mermaid 源文件？',
  '外部 Mermaid · 仅点击保存写回',
  "cause?.code === 'external-modified'",
  'watch([diagramPath, isExternal]',
  "securityLevel: 'strict'",
  'prepareDiagramSvg',
  'diagramSvgToPng',
]) requireText(view, token, `external Mermaid workspace is missing ${token}`)
requireText(access, 'let mermaid_file = directory.join("diagram.mmd")', 'external Mermaid authorization regression is missing')
for (const token of ['read_external_diagram_file', 'write_external_diagram_file']) {
  requireText(lib, token, `Tauri registry is missing ${token}`)
}

const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-4D2 must not add Mermaid installer associations')
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-4D2 external Mermaid workspace passed: strict preview, bounded source, guarded explicit save, export isolation and unchanged Windows associations are aligned.')
