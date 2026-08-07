import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const workbook = registry.formats.find(format => format.id === 'workbook')
if (!workbook || workbook.externalPolicy !== 'preview' || workbook.routeName !== 'Workbook'
  || workbook.capabilities.edit !== 'supported' || workbook.adapters.writer !== 'workbook'
  || workbook.userCapability.saveMode !== 'bounded-overwrite') {
  failures.push('XLSX must retain bounded library editing with a separate external preview')
}

const backend = read('src-tauri/src/commands/workbook.rs')
const view = read('src/views/WorkbookView.vue')
const access = read('src-tauri/src/services/external_file_access.rs')
const lib = read('src-tauri/src/lib.rs')
for (const token of [
  'pub async fn read_external_workbook_file',
  'pub async fn read_external_workbook_sheet',
  'access.resolve_preview(path)?',
  'ensure_workbook_format(path)?',
  'verify_workbook_source(path, &before)?',
  'XLSX 文件在只读解析期间发生变化',
  'external_workbook_reads_are_bounded_and_preserve_source',
]) requireText(backend, token, `external XLSX backend is missing ${token}`)
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "isExternal.value ? 'read_external_workbook_file' : 'read_workbook_file'",
  "isExternal.value ? 'read_external_workbook_sheet' : 'read_workbook_sheet'",
  '...(isExternal.value ? {} : { libraryRoot: store.libraryPath })',
  'external: isExternal.value',
  '<WorkspaceTabs v-if="isExternal',
  "'外部 XLSX · 只读'",
  '外部文件只读分页预览 · 源文件未修改 · 外部链接不会打开',
  'if (isExternal.value) return false',
  "if (isExternal.value && !['copy', 'linked-data', 'refresh'].includes(key)) return",
  'if (isExternal.value) return',
]) requireText(view, token, `external XLSX workspace is missing ${token}`)
requireText(access, 'resolve_preview(&workbook)', 'external XLSX preview authorization regression is missing')
requireText(lib, 'read_external_workbook_file', 'Tauri registry is missing external XLSX document reading')
requireText(lib, 'read_external_workbook_sheet', 'Tauri registry is missing external XLSX page reading')

const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-3G must not add an XLSX installer association')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-3G external XLSX preview passed: authorized source-preserving pagination is isolated from library editing, calculation, conversion, pivot rebuild and save commands.')
