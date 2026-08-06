import fs from 'node:fs'

const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const appearance = fs.readFileSync('src/config/fileTreeAppearance.ts', 'utf8')
const store = fs.readFileSync('src/store/app.ts', 'utf8')
const backend = fs.readFileSync('src-tauri/src/commands/config.rs', 'utf8')
const formats = JSON.parse(fs.readFileSync('shared/file-formats.json', 'utf8')).formats
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

for (const token of [
  'label: entry.name',
  "label: '编辑显示样式'",
  'fileStyleEditor.show',
  'FILE_MARKER_BACKGROUND_OPTIONS',
  'FILE_MARKER_TEXT_OPTIONS',
  'FILE_MARKER_ICON_OPTIONS',
  'resolveFileTreeVisual',
  'has-file-display-style',
  'markerTextColor',
  'fileNameWithExtension(sp)',
  'fileNameWithExtension(rf.path)',
  'fileTreeVisualForPath(sp)',
  'fileTreeVisualForPath(rf.path)',
]) requireText(library, token, `file tree appearance marker missing: ${token}`)
if (library.includes('fileDisplayName(entry.name)')) failures.push('file tree still strips registered extensions')

for (const format of formats) {
  const escaped = format.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mapping = new RegExp(`(?:^|[\\s,{])(?:['\"]${escaped}['\"]|${escaped})\\s*:`, 'm')
  if (!mapping.test(appearance)) failures.push(`format icon mapping missing: ${format.id}`)
}
for (const token of ['fileDisplayStyles', 'setFileDisplayStyle', 'clearFileDisplayStyle', 'moveFileDisplayStyles', 'removeFileDisplayStyles']) {
  requireText(store, token, `file marker persistence missing: ${token}`)
}
for (const token of ['FileDisplayStyle', 'file_display_styles', 'validate_file_display_styles', 'styles.len() > 512']) {
  requireText(backend, token, `backend marker boundary missing: ${token}`)
}

if (failures.length) {
  console.error(`File tree appearance check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`File tree appearance passed: ${formats.length} registered formats retain extensions, use mapped visuals, and support bounded local markers.`)
