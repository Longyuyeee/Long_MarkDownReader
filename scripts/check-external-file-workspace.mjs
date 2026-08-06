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
const access = read('src-tauri/src/services/external_file_access.rs')
const commands = read('src-tauri/src/commands/files.rs')
const packageJson = json('package.json')
const audit = read('docs/UX50A_External_Markdown_Text_Workspace_Audit_2026-08-06.md')

const editableIds = registry.formats
  .filter(format => format.externalPolicy === 'edit')
  .map(format => format.id)
  .sort()
if (JSON.stringify(editableIds) !== JSON.stringify(['markdown', 'plain-text'])) {
  failures.push(`EA-1 external edit boundary drift: ${editableIds.join(', ')}`)
}

for (const token of [
  "format.externalPolicy !== 'edit'",
  "format.id === 'markdown'",
  "name: 'TempMode'",
  "format.routeName === 'TextEditor'",
  "name: 'TextEditor'",
  "external: '1'",
]) requireText(navigation, token, `external route mapping is missing ${token}`)
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
]) requireText(text, token, `external text workspace is missing ${token}`)

for (const token of ['authorize_editable', 'format.external_policy != "edit"', 'resolve_editable']) {
  requireText(access, token, `backend external authorization is missing ${token}`)
}
for (const token of ['read_external_markdown_file', 'write_external_markdown_file', 'file_format_for_path(&path)?.id != "markdown"']) {
  requireText(commands, token, `backend Markdown boundary is missing ${token}`)
}

const associations = tauri.bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-1 must not expand installer file associations')
}
if (lifecycle.fileAssociations?.defaultSelectionOwner !== 'windows' || lifecycle.fileAssociations?.directRegistryDefaultWrite !== false) {
  failures.push('Windows default-app ownership drift')
}

if (!packageJson.scripts?.['check:external-file-workspace']) failures.push('EA-1 package check is missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-external-file-workspace')) failures.push('EA-1 is outside the current development audit chain')
for (const token of ['EA-1', 'Markdown', 'TXT', '显式保存', 'Windows', 'EA-2']) {
  requireText(audit, token, `EA-1 audit is missing ${token}`)
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('EA-1 external workspace passed: Markdown and TXT use explicit authorized routes, full-height editors, explicit saves, and the existing Windows association boundary.')
