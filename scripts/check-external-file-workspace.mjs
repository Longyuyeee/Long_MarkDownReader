import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const tauri = json('src-tauri/tauri.conf.json')
const lifecycle = json('shared/windows-lifecycle-policy.json')
const navigation = read('src/services/externalFileNavigation.ts')
const app = read('src/App.vue')
const markdown = read('src/views/TempMode.vue')
const text = read('src/views/TextEditorView.vue')
const structuredViews = {
  json: read('src/views/JsonEditorView.vue'),
  yaml: read('src/views/YamlEditorView.vue'),
  xml: read('src/views/XmlEditorView.vue'),
  toml: read('src/views/TomlEditorView.vue'),
}
const settings = read('src/views/SettingsView.vue')
const capabilities = read('src/views/ReleaseCapabilitiesView.vue')
const access = read('src-tauri/src/services/external_file_access.rs')
const commands = read('src-tauri/src/commands/files.rs')
const formatCommands = read('src-tauri/src/commands/formats.rs')
const structuredCommands = {
  json: read('src-tauri/src/commands/json.rs'),
  yaml: read('src-tauri/src/commands/yaml.rs'),
  xml: read('src-tauri/src/commands/xml.rs'),
  svg: read('src-tauri/src/commands/svg.rs'),
  toml: read('src-tauri/src/commands/toml.rs'),
}
const packageJson = json('package.json')
const audit = read('docs/UX50A_External_Markdown_Text_Workspace_Audit_2026-08-06.md')
const ea2Audit = read('docs/UX50B_External_Text_Code_Default_App_Audit_2026-08-07.md')
const ea2bAudit = read('docs/UX50C_External_Structured_Source_Audit_2026-08-07.md')

const expectedEditableIds = [
  'c-family', 'canvas', 'editorconfig', 'env', 'gitignore', 'go', 'ini', 'javascript', 'json', 'jsonc',
  'jvm-code', 'log', 'markdown', 'plain-text', 'properties', 'python',
  'rust', 'shell', 'sql', 'svg', 'table', 'toml', 'typescript', 'web-source', 'xml', 'yaml',
]
const editableIds = registry.formats
  .filter(format => format.externalPolicy === 'edit')
  .map(format => format.id)
  .sort()
if (JSON.stringify(editableIds) !== JSON.stringify(expectedEditableIds)) {
  failures.push(`EA-2B external edit boundary drift: ${editableIds.join(', ')}`)
}
const dedicatedIds = new Set(['json', 'jsonc', 'yaml', 'xml', 'svg', 'toml', 'log', 'canvas', 'table'])
const invalidTextEditors = registry.formats.filter(format =>
  format.externalPolicy === 'edit' && format.id !== 'markdown' && !dedicatedIds.has(format.id)
  && (format.routeName !== 'TextEditor' || format.adapters.writer !== 'text'),
)
if (invalidTextEditors.length) {
  failures.push(`EA-2B general external edit formats bypass TextEditor: ${invalidTextEditors.map(format => format.id).join(', ')}`)
}
for (const [id, routeName] of Object.entries({ json: 'JsonEditor', jsonc: 'JsonEditor', yaml: 'YamlEditor', xml: 'XmlEditor', svg: 'XmlEditor', toml: 'TomlEditor', log: 'LogViewer' })) {
  const format = registry.formats.find(item => item.id === id)
  if (format?.externalPolicy !== 'edit' || format.routeName !== routeName || format.adapters.writer !== 'text') {
    failures.push(`${id} dedicated external route contract drift`)
  }
}
const canvas = registry.formats.find(item => item.id === 'canvas')
if (canvas?.externalPolicy !== 'edit' || canvas.routeName !== 'Canvas' || canvas.adapters.writer !== 'canvas' || canvas.maxBytes !== 20 * 1024 * 1024) {
  failures.push('canvas dedicated external route contract drift')
}
const table = registry.formats.find(item => item.id === 'table')
if (table?.externalPolicy !== 'edit' || table.routeName !== 'Table' || table.adapters.writer !== 'table') {
  failures.push('table dedicated external route contract drift')
}

for (const token of [
  "['edit', 'preview'].includes(format.externalPolicy)",
  "format.id === 'markdown'",
  "name: 'TempMode'",
  'return { name: format.routeName, query }',
  "external: '1'",
]) requireText(navigation, token, `external route mapping is missing ${token}`)
requireText(commands, 'pick_external_openable_file', 'external picker must expose the openable format boundary')
requireText(app, 'externalRouteForFile(cleanPath)', 'App does not use the explicit external route mapping')
if (app.includes("router.push({ name: 'TempMode', query: { path: cleanPath")) failures.push('generic Markdown fallback returned')

for (const token of [
  '外部 Markdown',
  '仅在点击保存时写回源文件',
  'const showOutline = ref(false)',
  'PanelLeftOpenIcon',
  'leaveExternalEditor',
  "await invoke('write_external_markdown_file'",
  'max-width: none !important',
  'height: 100% !important',
]) requireText(markdown, token, `external Markdown workspace is missing ${token}`)
if (markdown.includes('max-width: 800px')) failures.push('external Markdown retained the legacy narrow content column')

for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "'read_external_text_document_range'",
  "'read_external_text_document'",
  "'write_external_text_document'",
  '外部文件 · ',
  '仅点击保存写回',
]) requireText(text, token, `external text workspace is missing ${token}`)

for (const [name, source] of Object.entries(structuredViews)) {
  for (const token of [
    "const isExternal = computed(() => route.query.external === '1')",
    "'read_external_text_document'",
    'external: isExternal.value',
    '外部文件 · ',
    '仅点击保存写回',
  ]) requireText(source, token, `${name} external workspace is missing ${token}`)
}
for (const [name, source] of Object.entries(structuredCommands)) {
  requireText(source, `write_external_${name}_source_document`, `${name} dedicated external writer is missing`)
  requireText(source, 'write_external_registered_text_document', `${name} external writer bypasses the authorized reliable writer`)
}
for (const token of ['"json" | "jsonc" | "yaml" | "xml" | "svg" | "toml" | "log"', 'specialized-writer-required']) {
  requireText(formatCommands, token, `generic external writer boundary is missing ${token}`)
}

for (const token of [
  '格式能力与默认应用',
  'Long编辑不会自动覆盖',
  '查看与配置',
  '打开系统设置',
]) requireText(settings, token, `default-app settings are missing ${token}`)
for (const token of [
  '外部打开与默认应用',
  "'external-ready'",
  'Windows 默认应用始终由你确认',
  "invoke('open_default_apps_settings')",
  'externalPolicyDescription',
]) requireText(capabilities, token, `format capability external-opening UI is missing ${token}`)

for (const token of ['authorize_editable', 'format.external_policy != "edit"', 'resolve_editable']) {
  requireText(access, token, `backend external authorization is missing ${token}`)
}
for (const token of ['read_external_markdown_file', 'write_external_markdown_file', 'file_format_for_path(&path)?.id != "markdown"']) {
  requireText(commands, token, `backend Markdown boundary is missing ${token}`)
}

const associations = tauri.bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-2A must not expand installer file associations')
}
if (lifecycle.fileAssociations?.defaultSelectionOwner !== 'windows' || lifecycle.fileAssociations?.directRegistryDefaultWrite !== false) {
  failures.push('Windows default-app ownership drift')
}

if (!packageJson.scripts?.['check:external-file-workspace']) failures.push('EA-1 package check is missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-external-file-workspace')) failures.push('EA-1 is outside the current development audit chain')
for (const token of ['EA-1', 'Markdown', 'TXT', '显式保存', 'Windows', 'EA-2']) {
  requireText(audit, token, `EA-1 audit is missing ${token}`)
}
for (const token of ['EA-2A', '17', 'TextEditor', 'Windows', '默认应用', 'JSON', 'EA-2B']) {
  requireText(ea2Audit, token, `EA-2A audit is missing ${token}`)
}
for (const token of ['EA-2B', '23', 'JSONC', 'YAML', 'XML', 'SVG', 'TOML', '专用', '显式保存', 'EA-3']) {
  requireText(ea2bAudit, token, `EA-2B audit is missing ${token}`)
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('External workspace passed: 26 editable profiles include structured-source, LOG, Canvas and Table dedicated routes with explicit authorization, specialized save gates, and unchanged Windows associations.')
