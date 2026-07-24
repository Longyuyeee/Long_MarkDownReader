import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [registryText, frontend, rustRegistry, textKernel, jsonKernel, yamlKernel, formatCommands, jsonCommands, yamlCommands, files, externalAccess, index, library, textEditor, jsonEditor, yamlEditor, logViewer, workspaceTabs, router, app, appStore, settings, canvas, mindmap, opml] = await Promise.all([
  read('shared/file-formats.json'),
  read('src/config/fileFormats.ts'),
  read('src-tauri/src/formats/file_registry.rs'),
  read('src-tauri/src/formats/text.rs'),
  read('src-tauri/src/formats/json.rs'),
  read('src-tauri/src/formats/yaml.rs'),
  read('src-tauri/src/commands/formats.rs'),
  read('src-tauri/src/commands/json.rs'),
  read('src-tauri/src/commands/yaml.rs'),
  read('src-tauri/src/commands/files.rs'),
  read('src-tauri/src/services/external_file_access.rs'),
  read('src-tauri/src/commands/index.rs'),
  read('src/views/LibraryMode.vue'),
  read('src/views/TextEditorView.vue'),
  read('src/views/JsonEditorView.vue'),
  read('src/views/YamlEditorView.vue'),
  read('src/views/LogViewerView.vue'),
  read('src/components/WorkspaceTabs.vue'),
  read('src/router/index.ts'),
  read('src/App.vue'),
  read('src/store/app.ts'),
  read('src/views/SettingsView.vue'),
  read('src/views/CanvasView.vue'),
  read('src/views/MindMapView.vue'),
  read('src-tauri/src/formats/opml.rs'),
])

const registry = JSON.parse(registryText)
const failures = []
const ids = new Set()
const extensions = new Set()
const levels = new Set(['supported', 'planned', 'unsupported'])
const userCapabilityLevels = new Set(['complete-edit', 'basic-edit', 'read-annotate', 'preview-only', 'external-open', 'unsupported'])
const saveModes = new Set(['overwrite', 'bounded-overwrite', 'sidecar', 'copy', 'none'])

if (registry.schemaVersion !== 2 || !Array.isArray(registry.formats)) failures.push('registry schema must be version 2')
for (const format of registry.formats || []) {
  if (!format.id || ids.has(format.id)) failures.push(`duplicate or empty format id: ${format.id}`)
  ids.add(format.id)
  if (!format.routeName || !format.maxBytes || !format.adapters || !format.capabilities) failures.push(`incomplete format: ${format.id}`)
  if (!format.userCapability || !userCapabilityLevels.has(format.userCapability.level) || !saveModes.has(format.userCapability.saveMode) || !format.userCapability.label || !format.userCapability.description) failures.push(`invalid user capability: ${format.id}`)
  for (const extension of format.extensions || []) {
    if (!extension.startsWith('.') || extension !== extension.toLowerCase() || extensions.has(extension)) failures.push(`invalid or duplicate extension: ${extension}`)
    extensions.add(extension)
  }
  for (const level of Object.values(format.capabilities || {})) if (!levels.has(level)) failures.push(`invalid capability level in ${format.id}`)
  if ((format.capabilities?.create === 'supported') !== Boolean(format.creation && format.adapters?.creator)) failures.push(`creation contract mismatch: ${format.id}`)
  if ((format.capabilities?.index === 'supported') !== Boolean(format.adapters?.indexer)) failures.push(`index contract mismatch: ${format.id}`)
}

const text = registry.formats?.find(format => format.id === 'plain-text')
if (!text || text.extensions?.[0] !== '.txt' || !Object.values(text.capabilities).every(level => level === 'supported') || text.adapters?.reader !== 'text' || text.adapters?.indexer !== 'text' || text.routeName !== 'TextEditor' || text.userCapability?.level !== 'complete-edit') {
  failures.push('plain-text proof adapter is incomplete')
}
for (const id of ['json', 'jsonc']) {
  const format = registry.formats?.find(candidate => candidate.id === id)
  if (!format || format.routeName !== 'JsonEditor' || format.capabilities?.read !== 'supported' || format.capabilities?.edit !== 'supported' || format.capabilities?.create !== 'planned' || format.adapters?.reader !== 'text' || format.adapters?.writer !== 'text' || format.userCapability?.level !== 'basic-edit' || format.userCapability?.saveMode !== 'overwrite') {
    failures.push(`${id} source-edit contract is incomplete`)
  }
}
const yamlFormat = registry.formats?.find(format => format.id === 'yaml')
if (!yamlFormat
  || yamlFormat.routeName !== 'YamlEditor'
  || yamlFormat.extensions?.join(',') !== '.yaml,.yml'
  || yamlFormat.maxBytes !== 8 * 1024 * 1024
  || yamlFormat.capabilities?.read !== 'supported'
  || yamlFormat.capabilities?.edit !== 'supported'
  || yamlFormat.capabilities?.create !== 'planned'
  || yamlFormat.capabilities?.index !== 'supported'
  || yamlFormat.adapters?.reader !== 'text'
  || yamlFormat.adapters?.writer !== 'text'
  || yamlFormat.adapters?.indexer !== 'text'
  || yamlFormat.userCapability?.level !== 'basic-edit'
  || yamlFormat.userCapability?.saveMode !== 'overwrite') failures.push('A4 YAML source-edit contract is incomplete')
const opmlFormat = registry.formats?.find(format => format.id === 'opml')
if (!opmlFormat || opmlFormat.routeName !== 'MindMap' || opmlFormat.adapters?.reader !== 'opml' || opmlFormat.adapters?.indexer !== 'opml') failures.push('OPML professional adapter is incomplete')
const workbookFormat = registry.formats?.find(format => format.id === 'workbook')
if (!workbookFormat || workbookFormat.maxBytes !== 128 * 1024 * 1024) failures.push('workbook size limit must match the 128 MB backend budget')
if (workbookFormat?.userCapability?.level !== 'basic-edit' || workbookFormat?.userCapability?.saveMode !== 'bounded-overwrite') failures.push('workbook must be displayed as bounded basic editing')
const pdfFormat = registry.formats?.find(format => format.id === 'pdf')
if (pdfFormat?.userCapability?.level !== 'read-annotate' || pdfFormat?.userCapability?.saveMode !== 'sidecar') failures.push('PDF must be displayed as read/annotate sidecar mode')

const requireText = (source, value, message) => { if (!source.includes(value)) failures.push(message) }
const forbid = (source, pattern, message) => { if (pattern.test(source)) failures.push(message) }
requireText(frontend, "../../shared/file-formats.json", 'frontend must consume shared registry')
requireText(rustRegistry, '../../../shared/file-formats.json', 'Rust must consume shared registry')
requireText(frontend, 'SORTED_FILE_FORMATS', 'frontend matching must use longest-extension sorted formats')
requireText(frontend, 'userCapability', 'frontend must expose user-visible capability tiers')
requireText(rustRegistry, 'user_capability', 'Rust registry must expose user-visible capability tiers')
requireText(rustRegistry, '.max_by_key(|(extension_len, _)| *extension_len)', 'Rust matching must prefer the longest extension')
requireText(textKernel, 'TextDocumentSnapshot', 'A1 text kernel must expose reusable document snapshots')
requireText(textKernel, 'TextDocumentRangeSnapshot', 'A1 text kernel must expose bounded range snapshots')
requireText(textKernel, 'TextDocumentError', 'A1 text kernel must expose structured text errors')
requireText(textKernel, 'recoverable', 'A1 text errors must carry recovery semantics')
requireText(textKernel, 'TextReadOptions', 'A1 text reads must accept explicit encoding options')
requireText(textKernel, 'read_text_snapshot_with_options', 'A1 text reads must expose an option-aware snapshot reader')
requireText(textKernel, 'expected_signature', 'A1 text saves must carry read signatures')
requireText(textKernel, 'normalize_line_endings', 'A1 text saves must preserve newline policy')
requireText(textKernel, 'detect_bom', 'A1 text reads must detect BOM policy')
requireText(textKernel, 'user-selected', 'A1 text reads must report user-selected encoding confidence')
requireText(textKernel, 'gb18030', 'A1 text fixtures must cover GB18030 explicit reads')
requireText(textKernel, 'MAX_TEXT_RANGE_BYTES', 'A1 text ranges must enforce a bounded IPC payload')
requireText(textKernel, 'reads_multibyte_text_in_contiguous_ranges', 'A1 text ranges must preserve multibyte boundaries')
requireText(textKernel, 'normalized_content', 'A1 text saves must return normalized content for reread verification')
requireText(textKernel, 'encoding: encoding.name().to_string()', 'A1 text saves must carry the final write encoding')
requireText(textKernel, 'verify_current_signature', 'A1 text saves must reject external modifications')
requireText(jsonKernel, 'ParseOptions', 'A3 JSON analysis must declare strict parse options')
requireText(jsonKernel, 'allow_comments: jsonc', 'A3 JSONC analysis must explicitly allow comments')
requireText(jsonKernel, 'allow_trailing_commas: jsonc', 'A3 JSONC analysis must explicitly allow trailing commas')
requireText(jsonKernel, '"duplicate-key"', 'A3 JSON analysis must report duplicate object keys')
requireText(jsonKernel, '"precision-sensitive-number"', 'A3 JSON analysis must report precision-sensitive number literals')
requireText(jsonKernel, 'MAX_JSON_SOURCE_BYTES', 'A3 JSON analysis must enforce a source-size budget')
requireText(jsonKernel, 'MAX_JSON_NODES', 'A3 JSON analysis must enforce a node budget')
requireText(jsonKernel, 'MAX_JSON_PATH_ENTRIES', 'A3 JSON Path indexing must enforce a result budget')
requireText(jsonKernel, 'child_count: value_child_count(value)', 'A3 tree preview must receive authoritative child counts')
requireText(jsonKernel, 'depth,', 'A3 tree preview must receive authoritative AST depth')
requireText(jsonKernel, 'CommentCollectionStrategy::AsTokens', 'A3 source transforms must preserve JSONC comments as tokens')
requireText(jsonKernel, 'token_source', 'A3 source transforms must retain original token spellings')
requireText(jsonKernel, 'pretty_and_minify_preserve_source_literals_and_duplicate_keys', 'A3 source transforms must cover fidelity-sensitive literals')
requireText(jsonKernel, 'replace_json_scalar_source', 'A3 tree scalar edits must use the Rust source-range kernel')
requireText(jsonKernel, 'entry.start == start && entry.end == end', 'A3 tree scalar edits must match an exact AST node range')
requireText(jsonKernel, 'analysis.structure_edit_candidate', 'A3 tree scalar edits must enforce the source fidelity gate')
requireText(jsonKernel, 'scalar_replacement_respects_duplicate_and_precision_gates', 'A3 scalar edit fidelity gates must have regression coverage')
requireText(jsonKernel, 'key_start: key_range.as_ref()', 'A3 object key edits must expose exact parser ranges')
requireText(jsonKernel, 'rename_json_object_key_source', 'A3 object key edits must use the Rust source-range kernel')
requireText(jsonKernel, 'serde_json::to_string(new_key)', 'A3 object key edits must use the Rust JSON string encoder')
requireText(jsonKernel, 'object_key_rename_rejects_duplicate_stale_and_excessive_keys', 'A3 object key fidelity gates must have regression coverage')
requireText(jsonKernel, 'append_json_object_property_source', 'A3 object property appends must use the Rust source-range kernel')
requireText(jsonKernel, 'tail.chars().all(char::is_whitespace)', 'A3 object property appends must reject ambiguous trailing tokens')
requireText(jsonKernel, 'object_property_append_rejects_ambiguous_comments_duplicates_and_stale_ranges', 'A3 object property append gates must have regression coverage')
requireText(jsonKernel, 'append_json_array_item_source', 'A3 array item appends must use the Rust source-range kernel')
requireText(jsonKernel, 'array_item_append_rejects_ambiguous_comments_stale_ranges_and_precision_risks', 'A3 array item append gates must have regression coverage')
requireText(jsonKernel, 'remove_json_object_property_source', 'A3 object property removal must use the Rust source-range kernel')
requireText(jsonKernel, 'comma_followed_by_whitespace', 'A3 object property removal must prove delimiter ownership')
requireText(jsonKernel, 'object_property_remove_rejects_adjacent_comments_and_stale_ranges', 'A3 object property removal gates must have regression coverage')
requireText(jsonKernel, 'array_index,', 'A3 array item edits must expose authoritative parent indexes')
requireText(jsonKernel, 'remove_json_array_item_source', 'A3 array item removal must use the Rust source-range kernel')
requireText(jsonKernel, 'array_item_remove_rejects_adjacent_comments_root_and_stale_ranges', 'A3 array item removal gates must have regression coverage')
requireText(formatCommands, 'read_text_snapshot', 'generic text reads must use A1 text snapshot kernel')
requireText(formatCommands, 'read_options', 'generic text reads must pass explicit read options')
requireText(formatCommands, 'read_text_document_range', 'generic text reads must expose bounded range mode')
requireText(formatCommands, 'encode_text_for_save', 'generic text writes must use A1 encoding-preserving kernel')
requireText(formatCommands, '文本文件只读，无法覆盖保存', 'generic text writes must block read-only files before overwrite')
requireText(formatCommands, '文本保存后重读验证失败', 'generic text writes must verify content after reread')
requireText(formatCommands, 'read_external_text_document', 'A2 external TXT reads must use the generic text adapter')
requireText(formatCommands, 'read_external_text_document_range', 'A2 external large TXT files must expose bounded range reads')
requireText(formatCommands, 'write_external_text_document', 'A2 external TXT writes must use reliable text writes')
requireText(formatCommands, '"specialized-writer-required"', 'A3 generic text writes must not bypass JSON validation')
requireText(jsonCommands, 'write_json_source_document', 'A3 JSON source saves must use a dedicated command')
requireText(jsonCommands, '"invalid-json-save-blocked"', 'A3 JSON saves must block invalid source by default')
requireText(jsonCommands, 'allow_invalid', 'A3 JSON saves must require an explicit invalid-source override')
requireText(jsonCommands, 'write_registered_text_document', 'A3 JSON saves must reuse reliable text writes internally')
requireText(jsonCommands, 'expected_signature', 'A3 JSON saves must retain external conflict protection')
requireText(jsonCommands, 'generic_text_writer_cannot_bypass_json_validation', 'A3 JSON validation bypass must have regression coverage')
requireText(jsonCommands, 'transform_json_source', 'A3 JSON formatting must use the dedicated Rust transform command')
requireText(jsonCommands, '"json-scalar-edit-rejected"', 'A3 scalar edits must expose a stable rejection code')
requireText(jsonCommands, '"json-key-rename-rejected"', 'A3 object key edits must expose a stable rejection code')
requireText(jsonCommands, '"json-property-append-rejected"', 'A3 object property appends must expose a stable rejection code')
requireText(jsonCommands, '"json-array-append-rejected"', 'A3 array item appends must expose a stable rejection code')
requireText(jsonCommands, '"json-property-remove-rejected"', 'A3 object property removal must expose a stable rejection code')
requireText(jsonCommands, '"json-array-remove-rejected"', 'A3 array item removal must expose a stable rejection code')
requireText(library, 'error?.suggestion', 'text workspace errors must surface structured recovery suggestions')
requireText(library, "err?.code === 'read-too-large'", 'text workspace must route oversized files into range preview')
requireText(library, 'textReadOnlyReason', 'text workspace must persist per-tab read-only downgrade state')
requireText(library, 'loadNextTextRange', 'text workspace must allow incremental range loading')
requireText(router, "name: 'TextEditor'", 'A2 TXT editor must have a dedicated lazy route')
requireText(router, "name: 'JsonEditor'", 'A3 JSON editor must have a dedicated lazy route')
requireText(textEditor, "from 'codemirror'", 'A2 TXT editor must use the selected CodeMirror 6 engine')
requireText(textEditor, 'openSearchPanel', 'A2 TXT editor must expose find and replace')
requireText(textEditor, 'gotoLine', 'A2 TXT editor must expose line navigation')
requireText(textEditor, "'read_text_document_range'", 'A2 TXT editor must consume A1 range reads')
requireText(textEditor, "'write_text_document'", 'A2 TXT editor must consume A1 reliable writes')
requireText(textEditor, 'expectedSignature', 'A2 TXT saves must retain external conflict protection')
requireText(textEditor, 'readEncoding', 'A2 TXT editor must separate source decoding from save conversion')
requireText(textEditor, "'read_external_text_document'", 'A2 TXT editor must support authorized external reads')
requireText(textEditor, "'write_external_text_document'", 'A2 TXT editor must support authorized external writes')
requireText(textEditor, 'scheduleAutoSave', 'A2 TXT editor must expose debounced auto-save')
requireText(textEditor, 'registerCurrentTab', 'A2 TXT editor must register with unified session tabs')
requireText(textEditor, 'syncCurrentTab', 'A2 TXT drafts must survive workspace route changes')
requireText(jsonEditor, "from '@codemirror/lang-json'", 'A3 JSON source view must use the CodeMirror JSON language package')
requireText(jsonEditor, "EditorState.readOnly.of(isReadOnly)", 'A3 JSON source editing must retain file read-only enforcement')
requireText(jsonEditor, "EditorView.editable.of(!isReadOnly)", 'A3 JSON source editing must only enable writable files')
requireText(jsonEditor, "'analyze_json_source'", 'A3 JSON workspace must use authoritative Rust analysis')
requireText(jsonEditor, "'read_text_document'", 'A3 JSON workspace must reuse the reliable text reader')
requireText(jsonEditor, "'write_json_source_document'", 'A3 JSON workspace must use the dedicated validated writer')
requireText(jsonEditor, 'scheduleAnalysis', 'A3 JSON workspace must debounce live Rust analysis')
requireText(jsonEditor, 'restoreTabDraft', 'A3 JSON source drafts must survive workspace route changes')
requireText(jsonEditor, 'syncCurrentTab', 'A3 JSON source drafts must participate in dirty-session coordination')
requireText(jsonEditor, 'allowInvalid', 'A3 invalid source overwrite must require explicit confirmation')
requireText(jsonEditor, "'external-modified'", 'A3 JSON saves must surface external signature conflicts')
requireText(jsonEditor, "listen('command-save'", 'A3 JSON workspace must consume the global save command')
requireText(jsonEditor, "listen('command-refresh'", 'A3 JSON workspace must consume the global refresh command')
requireText(jsonEditor, '<WorkspaceTabs', 'A3 JSON workspace must consume unified session tabs')
requireText(jsonEditor, 'byteOffsetToCodeUnit', 'A3 diagnostics must translate Rust byte offsets for CodeMirror')
requireText(jsonEditor, 'openSearchPanel', 'A3 JSON workspace must expose source search')
requireText(jsonEditor, 'foldAll', 'A3 JSON workspace must expose source folding')
requireText(jsonEditor, "'transform_json_source'", 'A3 JSON workspace must use fidelity-safe Rust transforms')
requireText(jsonEditor, 'filteredPaths', 'A3 JSON workspace must expose bounded JSON Path navigation')
requireText(jsonEditor, "viewMode === 'tree'", 'A3 JSON workspace must expose a dedicated tree preview mode')
requireText(jsonEditor, 'MAX_TREE_RENDER_NODES', 'A3 tree preview must enforce a DOM render budget')
requireText(jsonEditor, 'visibleTreePaths', 'A3 tree preview must preserve parent-child visibility when folding')
requireText(jsonEditor, 'sourceRangeText', 'A3 tree node copy must use the original source range')
requireText(jsonEditor, 'showSourceRange', 'A3 tree nodes must navigate back to the source fact')
requireText(jsonEditor, "'replace_json_scalar_source'", 'A3 tree scalar edits must use the dedicated Rust command')
requireText(jsonEditor, 'scalarEditSource.value', 'A3 tree scalar edits must reject stale editor drafts')
requireText(jsonEditor, "'rename_json_object_key_source'", 'A3 tree object key edits must use the dedicated Rust command')
requireText(jsonEditor, 'keyRenameSource.value', 'A3 tree object key edits must reject stale editor drafts')
requireText(jsonEditor, "'append_json_object_property_source'", 'A3 tree object property appends must use the dedicated Rust command')
requireText(jsonEditor, 'propertyAppendSource.value', 'A3 tree object property appends must reject stale editor drafts')
requireText(jsonEditor, "'append_json_array_item_source'", 'A3 tree array item appends must use the dedicated Rust command')
requireText(jsonEditor, 'arrayAppendSource.value', 'A3 tree array item appends must reject stale editor drafts')
requireText(jsonEditor, "'remove_json_object_property_source'", 'A3 tree object property removal must use the dedicated Rust command')
requireText(jsonEditor, 'requestPropertyRemove', 'A3 tree object property removal must require explicit confirmation')
requireText(jsonEditor, "'remove_json_array_item_source'", 'A3 tree array item removal must use the dedicated Rust command')
requireText(jsonEditor, 'requestArrayRemove', 'A3 tree array item removal must require explicit confirmation')
requireText(jsonEditor, 'analysis.value?.structureEditCandidate', 'A3 tree scalar controls must consume the fidelity gate')
requireText(yamlKernel, 'MAX_YAML_SOURCE_BYTES', 'A4 YAML analysis must enforce a source budget')
requireText(yamlKernel, 'MAX_YAML_NODES', 'A4 YAML analysis must enforce a node budget')
requireText(yamlKernel, 'MarkedYamlOwned::load_from_str', 'A4 YAML analysis must use the authoritative parser')
requireText(yamlCommands, '"invalid-yaml-save-blocked"', 'A4 YAML save must block invalid source by default')
requireText(yamlCommands, 'write_registered_text_document', 'A4 YAML save must reuse the reliable text kernel')
requireText(yamlEditor, "yaml()", 'A4 YAML workspace must provide language-aware source editing')
requireText(yamlEditor, "'analyze_yaml_source'", 'A4 YAML workspace must consume authoritative analysis')
requireText(yamlEditor, "'write_yaml_source_document'", 'A4 YAML workspace must use the guarded save command')
requireText(yamlEditor, '<WorkspaceTabs', 'A4 YAML workspace must participate in unified session tabs')
requireText(yamlEditor, 'outlineTruncated', 'A4 YAML workspace must expose bounded structure outlines')
requireText(router, "name: 'YamlEditor'", 'A4 YAML workspace must have an independent route')
const logFormat = registry.formats.find(format => format.id === 'log')
if (!logFormat
  || logFormat.routeName !== 'LogViewer'
  || logFormat.capabilities?.read !== 'supported'
  || logFormat.capabilities?.edit !== 'planned'
  || logFormat.capabilities?.index !== 'supported'
  || logFormat.userCapability?.level !== 'preview-only'
  || logFormat.userCapability?.saveMode !== 'none'
  || logFormat.adapters?.reader !== 'text'
  || logFormat.adapters?.writer !== null) failures.push('A4 LOG read-only format contract is incomplete')
requireText(logViewer, "'read_text_document_range'", 'A4 LOG viewer must use bounded range reads')
requireText(logViewer, 'readTailRange', 'A4 LOG viewer must enter large files from a bounded tail window')
requireText(logViewer, 'pollForUpdates', 'A4 LOG viewer must refresh appended records')
requireText(logViewer, 'LEVEL_PATTERNS', 'A4 LOG viewer must classify common log levels')
requireText(logViewer, 'MAX_BUFFER_CHARS', 'A4 LOG viewer must bound its in-memory display buffer')
requireText(library, '<WorkspaceTabs', 'Markdown workspace must consume unified session tabs')
requireText(textEditor, '<WorkspaceTabs', 'TXT workspace must consume unified session tabs')
requireText(workspaceTabs, 'routeForFile', 'unified tabs must route each registered format to its workspace')
requireText(workspaceTabs, 'tab.isDirty', 'unified tabs must confirm before discarding dirty drafts')
requireText(appStore, '.filter(tab => !tab.external)', 'external authorization tabs must not survive process restart')
requireText(app, 'confirmDiscardUnsaved', 'application exit must coordinate dirty session tabs')
requireText(app, "'pick_external_editable_file'", 'external picker must accept every registered editable text format')
requireText(app, "external: '1'", 'external TXT routes must retain their authorization context')
requireText(appStore, 'textAutoSaveEnabled', 'TXT auto-save preference must be persisted')
requireText(settings, 'TXT 自动保存', 'TXT auto-save preference must be user configurable')
requireText(files, 'file_format_registry()', 'workspace scanning must consume registry')
requireText(externalAccess, 'file_format_for_path', 'external authorization must consume registry')
requireText(index, 'format.adapters.indexer', 'index dispatch must consume registered adapters')
requireText(library, 'CREATABLE_FILE_FORMATS', 'creation menu must derive from registry')
requireText(library, 'activeFormatCanEdit', 'text workspace save action must consume format edit capability')
requireText(library, 'format-capability-badge', 'text workspace must display user-visible capability tiers')
requireText(library, 'format.userCapability.label', 'file tree must expose registered capability labels')
requireText(library, "'read_text_document'", 'text reads must use the generic adapter')
requireText(library, "'write_text_document'", 'text writes must use the generic adapter')
requireText(library, 'expectedSignature', 'text workspace saves must pass snapshot signatures')
requireText(library, 'text-snapshot-badge', 'text workspace must display A1 encoding/newline snapshot state')
requireText(library, 'textEncodingMenuOptions', 'text workspace must expose explicit encoding read/save actions')
requireText(library, 'readOptions', 'text workspace must pass explicit encoding read options')
requireText(library, 'savePolicy', 'text workspace must pass explicit encoding save policy')
requireText(library, 'textReadEncoding', 'text workspace must preserve user-selected read encoding per tab')
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
  console.log(`File format contract check passed: schema v${registry.schemaVersion}, ${registry.formats.length} formats, ${extensions.size} extensions, user capability tiers, longest-extension routing.`)
}
