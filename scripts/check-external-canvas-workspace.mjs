import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const canvas = registry.formats.find(format => format.id === 'canvas')
if (!canvas || canvas.externalPolicy !== 'edit' || canvas.routeName !== 'Canvas'
  || canvas.capabilities.edit !== 'supported' || canvas.adapters.writer !== 'canvas'
  || canvas.userCapability.saveMode !== 'overwrite' || canvas.maxBytes !== 20 * 1024 * 1024) {
  failures.push('JSON Canvas must expose its validated 20 MiB editor through a dedicated external route')
}

const counts = registry.formats.reduce((result, format) => {
  result[format.externalPolicy] = (result[format.externalPolicy] || 0) + 1
  return result
}, {})
if (counts.edit !== 28 || counts.preview !== 8 || counts.import !== 7) {
  failures.push(`EA-4B policy counts drift: ${JSON.stringify(counts)}`)
}
for (const id of ['opml']) {
  if (registry.formats.find(format => format.id === id)?.externalPolicy !== 'import') {
    failures.push(`${id} must remain import-only until its specialized workspace is audited`)
  }
}

const backend = read('src-tauri/src/commands/canvas.rs')
const formatKernel = read('src-tauri/src/formats/canvas.rs')
const view = read('src/views/CanvasView.vue')
const access = read('src-tauri/src/services/external_file_access.rs')
const lib = read('src-tauri/src/lib.rs')
for (const token of [
  'pub async fn read_external_canvas_file',
  'pub async fn write_external_canvas_file',
  'read_external_canvas_file_with_access',
  'write_external_canvas_file_with_access',
  '.resolve_editable(path)',
  'ensure_canvas_path(&file_path)?',
  'recover_interrupted_write(path)',
  'validate_canvas_json(&content)',
  'verify_current_signature(&file_path, Some(&expected_signature))?',
  'external_canvas_requires_authorization_and_rejects_stale_or_invalid_writes',
  'external-not-authorized',
  'canvas-invalid',
  'external-modified',
]) requireText(backend, token, `external Canvas backend is missing ${token}`)
requireText(formatKernel, 'MAX_CANVAS_BYTES: usize = 20 * 1024 * 1024', 'Canvas 20 MiB validation boundary drift')
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "isExternal.value ? 'read_external_canvas_file' : 'read_canvas_file'",
  "'write_external_canvas_file'",
  'expectedSignature: sourceSignature.value',
  "window.confirm('保存将覆盖当前外部 Canvas 源文件",
  "error?.code === 'external-modified'",
  'external: isExternal.value',
  '<WorkspaceTabs v-if="isExternal"',
  'v-if="!isExternal && isChartNode(node)"',
  'v-else-if="!isExternal && isMermaidNode(node)"',
  '外部 Canvas 不会自动读取引用文件',
  'watch([canvasPath, isExternal',
]) requireText(view, token, `external Canvas workspace is missing ${token}`)
requireText(access, 'let canvas_file = directory.join("project.canvas")', 'external Canvas authorization regression is missing')
requireText(lib, 'read_external_canvas_file', 'Tauri registry is missing external Canvas reading')
requireText(lib, 'write_external_canvas_file', 'Tauri registry is missing external Canvas writing')

const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-4B must not add a Canvas installer association')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-4B external Canvas workspace passed: validated explicit saves, source signatures, reference isolation and unchanged Windows associations are aligned.')
