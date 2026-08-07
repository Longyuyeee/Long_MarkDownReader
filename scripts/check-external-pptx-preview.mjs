import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const pptx = registry.formats.find(format => format.id === 'pptx')
if (!pptx || pptx.externalPolicy !== 'preview' || pptx.routeName !== 'PptxReader'
  || pptx.capabilities.edit !== 'supported' || pptx.adapters.writer !== 'pptx'
  || pptx.userCapability.saveMode !== 'copy') {
  failures.push('PPTX must retain reliable-copy library editing with a separate external preview')
}
const backend = read('src-tauri/src/commands/pptx.rs')
const view = read('src/views/PptxReaderView.vue')
const access = read('src-tauri/src/services/external_file_access.rs')
const lib = read('src-tauri/src/lib.rs')
for (const token of [
  'pub async fn read_external_pptx_presentation',
  'access.resolve_preview(path)?',
  'ensure_pptx_format(&presentation)?',
  'let source_preserved = bytes == after',
  'PPTX 文件在只读解析期间发生变化',
  'external_format_gate_accepts_only_pptx',
]) requireText(backend, token, `external PPTX backend is missing ${token}`)
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "isExternal.value ? 'read_external_pptx_presentation' : 'read_pptx_presentation'",
  '...(isExternal.value ? {} : { libraryRoot: store.libraryPath })',
  'external: isExternal.value',
  'v-if="!isExternal"',
  'editBaseline && !isExternal',
  'verifiedPreview && verifiedOperation && !isExternal',
  'baselineLoading.value || isExternal.value',
  '外部演示文稿 · 只读 · 不会写回',
  '<WorkspaceTabs v-if="isExternal',
]) requireText(view, token, `external PPTX workspace is missing ${token}`)
requireText(access, 'resolve_preview(&powerpoint)', 'external PPTX preview authorization regression is missing')
requireText(lib, 'read_external_pptx_presentation', 'Tauri command registry is missing external PPTX reading')

const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-3F must not add a PPTX installer association')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-3F external PPTX preview passed: external reading has no edit baseline or copy-save UI, and library reliable-copy editing remains intact.')
