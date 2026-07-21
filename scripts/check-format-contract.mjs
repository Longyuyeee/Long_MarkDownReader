import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [registryText, frontend, rustRegistry, files, externalAccess, index, library, canvas, mindmap, opml] = await Promise.all([
  read('shared/file-formats.json'),
  read('src/config/fileFormats.ts'),
  read('src-tauri/src/formats/file_registry.rs'),
  read('src-tauri/src/commands/files.rs'),
  read('src-tauri/src/services/external_file_access.rs'),
  read('src-tauri/src/commands/index.rs'),
  read('src/views/LibraryMode.vue'),
  read('src/views/CanvasView.vue'),
  read('src/views/MindMapView.vue'),
  read('src-tauri/src/formats/opml.rs'),
])

const registry = JSON.parse(registryText)
const failures = []
const ids = new Set()
const extensions = new Set()
const levels = new Set(['supported', 'planned', 'unsupported'])

if (registry.schemaVersion !== 1 || !Array.isArray(registry.formats)) failures.push('registry schema must be version 1')
for (const format of registry.formats || []) {
  if (!format.id || ids.has(format.id)) failures.push(`duplicate or empty format id: ${format.id}`)
  ids.add(format.id)
  if (!format.routeName || !format.maxBytes || !format.adapters || !format.capabilities) failures.push(`incomplete format: ${format.id}`)
  for (const extension of format.extensions || []) {
    if (!extension.startsWith('.') || extension !== extension.toLowerCase() || extensions.has(extension)) failures.push(`invalid or duplicate extension: ${extension}`)
    extensions.add(extension)
  }
  for (const level of Object.values(format.capabilities || {})) if (!levels.has(level)) failures.push(`invalid capability level in ${format.id}`)
  if ((format.capabilities?.create === 'supported') !== Boolean(format.creation && format.adapters?.creator)) failures.push(`creation contract mismatch: ${format.id}`)
  if ((format.capabilities?.index === 'supported') !== Boolean(format.adapters?.indexer)) failures.push(`index contract mismatch: ${format.id}`)
}

const text = registry.formats?.find(format => format.id === 'plain-text')
if (!text || text.extensions?.[0] !== '.txt' || !Object.values(text.capabilities).every(level => level === 'supported') || text.adapters?.reader !== 'text' || text.adapters?.indexer !== 'text') {
  failures.push('plain-text proof adapter is incomplete')
}
const opmlFormat = registry.formats?.find(format => format.id === 'opml')
if (!opmlFormat || opmlFormat.routeName !== 'MindMap' || opmlFormat.adapters?.reader !== 'opml' || opmlFormat.adapters?.indexer !== 'opml') failures.push('OPML professional adapter is incomplete')
const workbookFormat = registry.formats?.find(format => format.id === 'workbook')
if (!workbookFormat || workbookFormat.maxBytes !== 128 * 1024 * 1024) failures.push('workbook size limit must match the 128 MB backend budget')

const requireText = (source, value, message) => { if (!source.includes(value)) failures.push(message) }
const forbid = (source, pattern, message) => { if (pattern.test(source)) failures.push(message) }
requireText(frontend, "../../shared/file-formats.json", 'frontend must consume shared registry')
requireText(rustRegistry, '../../../shared/file-formats.json', 'Rust must consume shared registry')
requireText(files, 'file_format_registry()', 'workspace scanning must consume registry')
requireText(externalAccess, 'file_format_for_path', 'external authorization must consume registry')
requireText(index, 'format.adapters.indexer', 'index dispatch must consume registered adapters')
requireText(library, 'CREATABLE_FILE_FORMATS', 'creation menu must derive from registry')
requireText(library, "'read_text_document'", 'text reads must use the generic adapter')
requireText(library, "'write_text_document'", 'text writes must use the generic adapter')
requireText(canvas, 'routeForFile(path)', 'Canvas file opening must use registered routing')
requireText(mindmap, "'write_opml_file'", 'Mind map editor must use reliable OPML writer')
requireText(mindmap, "'create_canvas_from_opml'", 'Mind map editor must expose Canvas projection')
requireText(opml, 'MAX_OPML_NODES', 'OPML parser must enforce a node budget')
forbid(files, /\[\s*"\.md"[\s\S]{0,200}"\.canvas"/, 'workspace scan reintroduced a manual extension list')
forbid(externalAccess, /\[\s*"\.md"[\s\S]{0,250}"\.xlsx"/, 'external access reintroduced a manual extension list')

if (failures.length) {
  console.error(`File format contract check failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`File format contract check passed: ${registry.formats.length} formats, ${extensions.size} extensions, shared frontend/Rust registry.`)
}
