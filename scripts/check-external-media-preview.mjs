import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

const registry = json('shared/file-formats.json')
const tauri = json('src-tauri/tauri.conf.json')
const previewIds = registry.formats
  .filter(format => format.externalPolicy === 'preview')
  .map(format => format.id)
  .sort()
if (JSON.stringify(previewIds) !== JSON.stringify(['raster-image', 'video'])) {
  failures.push(`EA-3A external preview boundary drift: ${previewIds.join(', ')}`)
}
for (const id of previewIds) {
  const format = registry.formats.find(item => item.id === id)
  if (format.routeName !== 'MediaViewer' || format.capabilities.edit !== 'unsupported'
    || format.adapters.writer !== null || format.userCapability.saveMode !== 'none') {
    failures.push(`${id} must remain a read-only MediaViewer format without a writer`)
  }
}

const access = read('src-tauri/src/services/external_file_access.rs')
const mediaBackend = read('src-tauri/src/commands/media.rs')
const mediaView = read('src/views/MediaViewerView.vue')
const app = read('src/App.vue')
const navigation = read('src/services/externalFileNavigation.ts')
const capabilities = read('src/views/ReleaseCapabilitiesView.vue')
const files = read('src-tauri/src/commands/files.rs')
const lib = read('src-tauri/src/lib.rs')

for (const token of ['authorized_previews', 'authorize_openable', 'authorize_preview', 'resolve_preview', 'format.external_policy != "preview"']) {
  requireText(access, token, `external preview authorization is missing ${token}`)
}
for (const token of ['inspect_external_media_file', 'access.resolve_preview(path)?', 'inspect_resolved_media_file']) {
  requireText(mediaBackend, token, `external media backend is missing ${token}`)
}
for (const token of [
  "const isExternal = computed(() => route.query.external === '1')",
  "isExternal.value ? 'inspect_external_media_file' : 'inspect_media_file'",
  'external: isExternal.value',
  '外部文件 · ',
  '不会写回',
]) requireText(mediaView, token, `external media workspace is missing ${token}`)
for (const token of ['isExternallyOpenable', "'pick_external_openable_file'"]) {
  requireText(app, token, `application external preview entry is missing ${token}`)
}
requireText(navigation, "['edit', 'preview'].includes(format.externalPolicy)", 'external navigation does not route preview formats')
requireText(files, 'matches!(format.external_policy.as_str(), "edit" | "preview")', 'file picker does not include preview formats')
requireText(lib, 'access.authorize_openable', 'startup and single-instance routing do not authorize preview formats')
for (const token of ['externalPreviewCount', "externalPolicy === 'preview'", '预览格式永不写回', "preview: '"]) {
  requireText(capabilities, token, `format capability UI is missing ${token}`)
}

const associations = tauri.bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-3A must not add image or video installer associations')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-3A external media preview contract passed: 2 read-only formats, explicit authorization, zero writer and zero new installer associations.')
