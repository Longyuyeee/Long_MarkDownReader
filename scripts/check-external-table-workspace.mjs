import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const table = registry.formats.find(format => format.id === 'table')
if (!table || table.externalPolicy !== 'edit' || table.routeName !== 'Table'
  || table.capabilities.edit !== 'supported' || table.adapters.writer !== 'table'
  || table.userCapability.saveMode !== 'overwrite'
  || JSON.stringify(table.extensions) !== JSON.stringify(['.table.json', '.csv', '.tsv'])) {
  failures.push('Table, CSV and TSV must share the dedicated guarded external editor')
}

const counts = registry.formats.reduce((result, format) => {
  result[format.externalPolicy] = (result[format.externalPolicy] || 0) + 1
  return result
}, {})
if (counts.edit !== 27 || counts.preview !== 8 || counts.import !== 8) {
  failures.push(`EA-4C policy counts drift: ${JSON.stringify(counts)}`)
}
for (const id of ['diagram', 'opml']) {
  if (registry.formats.find(format => format.id === id)?.externalPolicy !== 'import') {
    failures.push(`${id} must remain import-only until its specialized workspace is audited`)
  }
}

const backend = read('src-tauri/src/commands/table.rs')
const view = read('src/views/TableView.vue')
const access = read('src-tauri/src/services/external_file_access.rs')
const lib = read('src-tauri/src/lib.rs')
for (const token of [
  'pub async fn read_external_table_file',
  'pub async fn write_external_table_file',
  'read_external_table_file_with_access',
  'write_external_table_file_with_access',
  'access.resolve_editable(path)',
  'ensure_table_path(&file)?',
  'expected_signature',
  'delimiter != expected_delimiter',
  'payload.line_ending == "crlf"',
  'payload.has_bom && encoding == encoding_rs::UTF_8',
  'external_table_requires_authorization_and_preserves_source_conflicts',
  '其他程序修改',
]) requireText(backend, token, `external Table backend is missing ${token}`)
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "isExternal.value ? 'read_external_table_file' : 'read_table_file'",
  "invoke<TableWriteResult>('write_external_table_file'",
  '保存将覆盖当前外部',
  '外部表格 · 仅点击保存写回',
  'external: isExternal.value',
  '<WorkspaceTabs v-if="isExternal"',
  "watch([tablePath, isExternal",
  "detail.includes('其他程序修改')",
  '!isExternal && table.format',
]) requireText(view, token, `external Table workspace is missing ${token}`)
requireText(access, 'let table_file = directory.join("data.csv")', 'external Table authorization regression is missing')
requireText(lib, 'read_external_table_file', 'Tauri registry is missing external Table reading')
requireText(lib, 'write_external_table_file', 'Tauri registry is missing external Table writing')

const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-4C must not add Table, CSV or TSV installer associations')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-4C external Table workspace passed: native formats, explicit overwrite, source identity and unchanged Windows associations are aligned.')
