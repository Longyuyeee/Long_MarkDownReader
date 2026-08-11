import { readFile } from 'node:fs/promises'
import { ODT_PREVIEW_FORMAT } from './odt-release-state-machine.mjs'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [registryText, frontend, rustRegistry, textKernel, jsonKernel, yamlKernel, xmlKernel, tomlKernel, docxKernel, docxPatchKernel, pptxKernel, pptxEditKernel, formatCommands, jsonCommands, yamlCommands, xmlCommands, tomlCommands, docxCommands, pptxCommands, files, externalAccess, index, library, textEditor, jsonEditor, yamlEditor, xmlEditor, tomlEditor, docxReader, pptxReader, pptxObjectContent, logViewer, workspaceTabs, router, app, externalWindows, appStore, settings, canvas, mindmap, opml, knowledgeIndex, codeEditingSupport, safeHtmlPreview] = await Promise.all([
  read('shared/file-formats.json'),
  read('src/config/fileFormats.ts'),
  read('src-tauri/src/formats/file_registry.rs'),
  read('src-tauri/src/formats/text.rs'),
  read('src-tauri/src/formats/json.rs'),
  read('src-tauri/src/formats/yaml.rs'),
  read('src-tauri/src/formats/xml.rs'),
  read('src-tauri/src/formats/toml.rs'),
  read('src-tauri/src/formats/docx.rs'),
  read('src-tauri/src/formats/docx_patch.rs'),
  read('src-tauri/src/formats/pptx.rs'),
  read('src-tauri/src/formats/pptx_edit.rs'),
  read('src-tauri/src/commands/formats.rs'),
  read('src-tauri/src/commands/json.rs'),
  read('src-tauri/src/commands/yaml.rs'),
  read('src-tauri/src/commands/xml.rs'),
  read('src-tauri/src/commands/toml.rs'),
  read('src-tauri/src/commands/docx.rs'),
  read('src-tauri/src/commands/pptx.rs'),
  read('src-tauri/src/commands/files.rs'),
  read('src-tauri/src/services/external_file_access.rs'),
  read('src-tauri/src/commands/index.rs'),
  read('src/views/LibraryMode.vue'),
  read('src/views/TextEditorView.vue'),
  read('src/views/JsonEditorView.vue'),
  read('src/views/YamlEditorView.vue'),
  read('src/views/XmlEditorView.vue'),
  read('src/views/TomlEditorView.vue'),
  read('src/views/DocxReaderView.vue'),
  read('src/views/PptxReaderView.vue'),
  read('src/components/pptx/PptxObjectContent.vue'),
  read('src/views/LogViewerView.vue'),
  read('src/components/WorkspaceTabs.vue'),
  read('src/router/index.ts'),
  read('src/App.vue'),
  read('src-tauri/src/services/external_windows.rs'),
  read('src/store/app.ts'),
  read('src/views/SettingsView.vue'),
  read('src/views/CanvasView.vue'),
  read('src/views/MindMapView.vue'),
  read('src-tauri/src/formats/opml.rs'),
  read('src-tauri/src/services/knowledge_index.rs'),
  read('src/utils/codeEditingSupport.ts'),
  read('src/utils/safeHtmlPreview.ts'),
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
  if (format.creation) {
    if (!format.extensions.includes(format.creation.defaultExtension)) failures.push(`default creation extension is not registered: ${format.id}`)
    const variants = format.creation.variants || []
    const variantExtensions = new Set(variants.map(variant => variant.extension))
    if (variants.some(variant => !variant.label || !variant.defaultName || !format.extensions.includes(variant.extension)) || variantExtensions.size !== variants.length) failures.push(`invalid creation variants: ${format.id}`)
    if (variants.length && (variantExtensions.size !== format.extensions.length || format.extensions.some(extension => !variantExtensions.has(extension)))) failures.push(`incomplete creation variants: ${format.id}`)
  }
  if ((format.capabilities?.index === 'supported') !== Boolean(format.adapters?.indexer)) failures.push(`index contract mismatch: ${format.id}`)
}

const text = registry.formats?.find(format => format.id === 'plain-text')
if (!text || text.extensions?.[0] !== '.txt' || !Object.values(text.capabilities).every(level => level === 'supported') || text.adapters?.reader !== 'text' || text.adapters?.indexer !== 'text' || text.routeName !== 'TextEditor' || text.userCapability?.level !== 'complete-edit') {
  failures.push('plain-text proof adapter is incomplete')
}
for (const id of ['json', 'jsonc']) {
  const format = registry.formats?.find(candidate => candidate.id === id)
  const expectedExtension = `.${id}`
  if (!format || format.routeName !== 'JsonEditor' || !Object.values(format.capabilities || {}).every(level => level === 'supported') || format.adapters?.reader !== 'text' || format.adapters?.writer !== 'text' || format.adapters?.creator !== 'text-template' || format.adapters?.indexer !== 'text' || format.creation?.defaultExtension !== expectedExtension || format.creation?.defaultContent !== '{}\n' || format.userCapability?.level !== 'basic-edit' || format.userCapability?.saveMode !== 'overwrite') {
    failures.push(`${id} create/edit/index contract is incomplete`)
  }
}
const envFormat = registry.formats?.find(format => format.id === 'env')
if (!envFormat
  || envFormat.routeName !== 'TextEditor'
  || envFormat.capabilities?.read !== 'supported'
  || envFormat.capabilities?.edit !== 'supported'
  || envFormat.capabilities?.index !== 'unsupported'
  || envFormat.adapters?.reader !== 'text'
  || envFormat.adapters?.writer !== 'text'
  || envFormat.adapters?.indexer !== null
  || envFormat.userCapability?.level !== 'basic-edit') failures.push('A4 ENV protected-edit contract is incomplete')
for (const id of ['ini', 'properties', 'editorconfig', 'gitignore']) {
  const format = registry.formats?.find(candidate => candidate.id === id)
  const indexed = id === 'ini' || id === 'properties'
  if (!format
    || format.routeName !== 'TextEditor'
    || format.capabilities?.read !== 'supported'
    || format.capabilities?.edit !== 'supported'
    || format.capabilities?.create !== 'supported'
    || (format.capabilities?.index === 'supported') !== indexed
    || format.adapters?.reader !== 'text'
    || format.adapters?.writer !== 'text'
    || Boolean(format.adapters?.indexer) !== indexed
    || format.userCapability?.level !== 'complete-edit') failures.push(`A4 ${id} text-workspace contract is incomplete`)
}
for (const id of ['javascript', 'typescript', 'python', 'rust', 'go', 'jvm-code', 'c-family', 'shell', 'sql', 'web-source']) {
  const format = registry.formats?.find(candidate => candidate.id === id)
  if (!format
    || format.routeName !== 'TextEditor'
    || format.capabilities?.read !== 'supported'
    || format.capabilities?.edit !== 'supported'
    || format.capabilities?.create !== 'supported'
    || format.capabilities?.index !== 'supported'
    || format.adapters?.reader !== 'text'
    || format.adapters?.writer !== 'text'
    || format.adapters?.creator !== 'text-template'
    || format.adapters?.indexer !== 'text'
    || !format.creation?.defaultContent
    || format.userCapability?.level !== 'basic-edit') failures.push(`A4 ${id} lightweight-code contract is incomplete`)
}
const yamlFormat = registry.formats?.find(format => format.id === 'yaml')
if (!yamlFormat
  || yamlFormat.routeName !== 'YamlEditor'
  || yamlFormat.extensions?.join(',') !== '.yaml,.yml'
  || yamlFormat.maxBytes !== 8 * 1024 * 1024
  || yamlFormat.capabilities?.read !== 'supported'
  || yamlFormat.capabilities?.edit !== 'supported'
  || yamlFormat.capabilities?.create !== 'supported'
  || yamlFormat.capabilities?.index !== 'supported'
  || yamlFormat.adapters?.reader !== 'text'
  || yamlFormat.adapters?.writer !== 'text'
  || yamlFormat.adapters?.creator !== 'text-template'
  || yamlFormat.adapters?.indexer !== 'text'
  || yamlFormat.creation?.defaultExtension !== '.yaml'
  || yamlFormat.userCapability?.level !== 'complete-edit'
  || yamlFormat.userCapability?.saveMode !== 'overwrite') failures.push('A4 YAML source-edit contract is incomplete')
const xmlFormat = registry.formats?.find(format => format.id === 'xml')
if (!xmlFormat
  || xmlFormat.routeName !== 'XmlEditor'
  || xmlFormat.extensions?.join(',') !== '.xml'
  || xmlFormat.maxBytes !== 8 * 1024 * 1024
  || xmlFormat.capabilities?.read !== 'supported'
  || xmlFormat.capabilities?.edit !== 'supported'
  || xmlFormat.capabilities?.create !== 'supported'
  || xmlFormat.capabilities?.index !== 'supported'
  || xmlFormat.adapters?.reader !== 'text'
  || xmlFormat.adapters?.writer !== 'text'
  || xmlFormat.adapters?.creator !== 'text-template'
  || xmlFormat.adapters?.indexer !== 'text'
  || xmlFormat.creation?.defaultExtension !== '.xml'
  || xmlFormat.userCapability?.level !== 'complete-edit'
  || xmlFormat.userCapability?.saveMode !== 'overwrite') failures.push('A4 XML source-edit contract is incomplete')
const tomlFormat = registry.formats?.find(format => format.id === 'toml')
if (!tomlFormat
  || tomlFormat.routeName !== 'TomlEditor'
  || tomlFormat.capabilities?.read !== 'supported'
  || tomlFormat.capabilities?.edit !== 'supported'
  || tomlFormat.capabilities?.create !== 'supported'
  || tomlFormat.capabilities?.index !== 'supported'
  || tomlFormat.adapters?.reader !== 'text'
  || tomlFormat.adapters?.writer !== 'text'
  || tomlFormat.adapters?.creator !== 'text-template'
  || tomlFormat.adapters?.indexer !== 'text'
  || tomlFormat.creation?.defaultExtension !== '.toml'
  || tomlFormat.userCapability?.level !== 'complete-edit') failures.push('A4 TOML complete-edit contract is incomplete')
const opmlFormat = registry.formats?.find(format => format.id === 'opml')
if (!opmlFormat || opmlFormat.routeName !== 'MindMap' || opmlFormat.adapters?.reader !== 'opml' || opmlFormat.adapters?.indexer !== 'opml') failures.push('OPML professional adapter is incomplete')
const workbookFormat = registry.formats?.find(format => format.id === 'workbook')
if (!workbookFormat || workbookFormat.maxBytes !== 128 * 1024 * 1024) failures.push('workbook size limit must match the 128 MB backend budget')
if (workbookFormat?.userCapability?.level !== 'basic-edit' || workbookFormat?.userCapability?.saveMode !== 'bounded-overwrite') failures.push('workbook must be displayed as bounded basic editing')
if (workbookFormat?.capabilities?.index !== 'supported' || workbookFormat?.adapters?.indexer !== 'workbook') failures.push('workbook must expose bounded local sheet indexing')
if (!knowledgeIndex.includes('build_workbook_index_segments')
  || !knowledgeIndex.includes('MAX_WORKBOOK_INDEX_CELLS')
  || !knowledgeIndex.includes('MAX_WORKBOOK_INDEX_UNCOMPRESSED_BYTES')
  || !knowledgeIndex.includes('Some("workbook-sheet".into())')
  || !knowledgeIndex.includes('real_xlsx_enters_persistent_search_by_sheet_without_mutation')
  || !knowledgeIndex.includes('workbook_index_rejects_extreme_archive_expansion')) failures.push('workbook persistent indexing proof is incomplete')
if (!index.includes('indexer == "workbook"') || !index.includes('build_workbook_index_segments')) failures.push('workbook live search fallback is incomplete')
if (!library.includes("result.objectType === 'workbook'") || !library.includes('{ sheet: result.locatorObjectId }')) failures.push('workbook search result routing is incomplete')
const pdfFormat = registry.formats?.find(format => format.id === 'pdf')
if (pdfFormat?.userCapability?.level !== 'read-annotate' || pdfFormat?.userCapability?.saveMode !== 'sidecar') failures.push('PDF must be displayed as read/annotate sidecar mode')
const docxFormat = registry.formats?.find(format => format.id === 'docx')
if (!docxFormat
  || docxFormat.routeName !== 'DocxEditor'
  || docxFormat.extensions?.join(',') !== '.docx'
  || docxFormat.maxBytes !== 64 * 1024 * 1024
  || docxFormat.capabilities?.read !== 'supported'
  || docxFormat.capabilities?.edit !== 'supported'
  || docxFormat.capabilities?.create !== 'unsupported'
  || docxFormat.capabilities?.index !== 'supported'
  || docxFormat.adapters?.reader !== 'docx'
  || docxFormat.adapters?.writer !== 'docx'
  || docxFormat.adapters?.creator !== null
  || docxFormat.adapters?.indexer !== 'docx'
  || docxFormat.userCapability?.level !== 'basic-edit'
  || docxFormat.userCapability?.saveMode !== 'bounded-overwrite') failures.push('UX-33 DOCX bounded source/copy editing contract is incomplete')
const pptxFormat = registry.formats?.find(format => format.id === 'pptx')
if (!pptxFormat
  || pptxFormat.routeName !== 'PptxReader'
  || pptxFormat.extensions?.join(',') !== '.pptx'
  || pptxFormat.maxBytes !== 96 * 1024 * 1024
  || pptxFormat.capabilities?.read !== 'supported'
  || pptxFormat.capabilities?.edit !== 'supported'
  || pptxFormat.capabilities?.create !== 'unsupported'
  || pptxFormat.capabilities?.index !== 'supported'
  || pptxFormat.adapters?.reader !== 'pptx'
  || pptxFormat.adapters?.writer !== 'pptx'
  || pptxFormat.adapters?.creator !== null
  || pptxFormat.adapters?.indexer !== 'pptx'
  || pptxFormat.userCapability?.level !== 'basic-edit'
  || pptxFormat.userCapability?.label !== '基础编辑副本'
  || pptxFormat.userCapability?.saveMode !== 'copy'
  || !pptxFormat.userCapability?.description?.includes('单引用 PNG/JPEG')
  || !pptxFormat.userCapability?.description?.includes('幻灯片新增/复制/删除/排序')
  || !pptxFormat.userCapability?.description?.includes('原演示文稿始终只读')
  || !pptxFormat.userCapability?.description?.includes('母版、动画、SmartArt、复杂图表')) failures.push('C5D PPTX basic copy-edit contract is incomplete')
const odtFormat = registry.formats?.find(format => format.id === 'odt' || format.extensions?.includes('.odt'))
if (odtFormat && JSON.stringify(odtFormat) !== JSON.stringify(ODT_PREVIEW_FORMAT)) {
  failures.push('E1B ODT registration must match the exact preview-only contract')
}

const requireText = (source, value, message) => { if (!source.includes(value)) failures.push(message) }
const forbid = (source, pattern, message) => { if (pattern.test(source)) failures.push(message) }
requireText(frontend, "../../shared/file-formats.json", 'frontend must consume shared registry')
requireText(rustRegistry, '../../../shared/file-formats.json', 'Rust must consume shared registry')
requireText(frontend, 'SORTED_FILE_FORMATS', 'frontend matching must use longest-extension sorted formats')
requireText(frontend, 'userCapability', 'frontend must expose user-visible capability tiers')
requireText(frontend, 'supported(format.capabilities.edit) !== Boolean(format.adapters.writer)', 'frontend registry must keep edit capability and writer adapters aligned')
requireText(rustRegistry, 'user_capability', 'Rust registry must expose user-visible capability tiers')
requireText(rustRegistry, 'format.capabilities.edit.is_supported() != format.adapters.writer.is_some()', 'Rust registry must keep edit capability and writer adapters aligned')
requireText(rustRegistry, '.max_by_key(|(extension_len, _)| *extension_len)', 'Rust matching must prefer the longest extension')
requireText(rustRegistry, 'is_sensitive_path', 'A4 must define one backend sensitive-path policy')
requireText(textEditor, 'maskEnvValues', 'A4 ENV workspace must mask values by default')
requireText(textEditor, '显示并允许编辑', 'A4 ENV workspace must require explicit per-file reveal')
requireText(textEditor, 'StreamLanguage.define', 'A4 code workspace must apply registered syntax highlighting')
requireText(textEditor, "extension === '.ps1'", 'A4 code workspace must select language modes by extension')
requireText(textEditor, 'discardDraft = false', 'A5 explicit reload must be able to discard an in-memory draft')
requireText(textEditor, 'load(sourceEncoding.value, true)', 'A5 external-conflict reload must read the disk version')
requireText(index, 'is_sensitive_path(&path)', 'live search must reject sensitive paths')
requireText(knowledgeIndex, 'is_sensitive_path(&path)', 'persistent index must reject sensitive paths')
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
requireText(formatCommands, 'write_new_bytes(&path, body.as_bytes())', 'A3R registered creation must atomically create without overwriting')
requireText(formatCommands, 'json_templates_are_valid_indexable_and_never_overwrite_existing_files', 'A3R JSON/JSONC creation must have validity and duplicate-name regression coverage')
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
forbid(textEditor, /scheduleAutoSave|save\(true\)|setTimeout\(\(\) => \{ void save/, 'A2 TXT/code editor must never write without an explicit save command')
requireText(textEditor, "from '@codemirror/autocomplete'", 'A4 code editor must expose bounded source completion')
requireText(textEditor, "from '@codemirror/lint'", 'A4 code editor must expose lightweight diagnostics')
requireText(textEditor, "viewMode === 'preview'", 'A4 HTML editor must expose safe preview mode')
requireText(textEditor, 'sandbox=""', 'A4 HTML preview must use a no-permission iframe sandbox')
requireText(textEditor, 'referrerpolicy="no-referrer"', 'A4 HTML preview must suppress referrer data')
requireText(codeEditingSupport, 'MAX_COMPLETION_SCAN_CHARS', 'A4 source completion must use a bounded document scan')
requireText(codeEditingSupport, 'MAX_DIAGNOSTIC_SCAN_CHARS', 'A4 source diagnostics must use a bounded document scan')
requireText(safeHtmlPreview, "default-src 'none'", 'A4 HTML preview must block resources by default')
requireText(safeHtmlPreview, "script-src 'none'", 'A4 HTML preview must block script execution')
requireText(safeHtmlPreview, "connect-src 'none'", 'A4 HTML preview must block network connections')
requireText(safeHtmlPreview, "form-action 'none'", 'A4 HTML preview must block form submission')
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
requireText(jsonEditor, 'treeVirtualHeight', 'A3 tree preview must expose a virtualized scroll height')
requireText(jsonEditor, 'treeWindow', 'A3 tree preview must render a bounded virtual window')
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
requireText(xmlKernel, 'MAX_XML_SOURCE_BYTES', 'A4 XML analysis must enforce a source budget')
requireText(xmlKernel, 'MAX_XML_NODES', 'A4 XML analysis must enforce an element budget')
requireText(xmlKernel, 'Event::DocType', 'A4 XML analysis must explicitly handle DTD input')
requireText(xmlCommands, '"invalid-xml-save-blocked"', 'A4 XML save must block unsafe or invalid source by default')
requireText(xmlCommands, 'write_registered_text_document', 'A4 XML save must reuse the reliable text kernel')
requireText(xmlEditor, "xml()", 'A4 XML workspace must provide language-aware source editing')
requireText(xmlEditor, "'analyze_xml_source'", 'A4 XML workspace must consume authoritative analysis')
requireText(xmlEditor, "'write_xml_source_document'", 'A4 XML workspace must use the guarded save command')
requireText(xmlEditor, '<WorkspaceTabs', 'A4 XML workspace must participate in unified session tabs')
requireText(xmlEditor, 'outlineTruncated', 'A4 XML workspace must expose bounded structure outlines')
requireText(router, "name: 'XmlEditor'", 'A4 XML workspace must have an independent route')
requireText(tomlKernel, 'DocumentMut::from_str', 'A4 TOML analysis must use the format-preserving parser')
requireText(tomlCommands, '"invalid-toml-save-blocked"', 'A4 TOML save must block invalid source by default')
requireText(tomlEditor, 'StreamLanguage.define(toml)', 'A4 TOML workspace must provide syntax highlighting')
requireText(tomlEditor, "'analyze_toml_source'", 'A4 TOML workspace must consume authoritative analysis')
requireText(tomlEditor, "'write_toml_source_document'", 'A4 TOML workspace must use guarded saving')
requireText(tomlEditor, '<WorkspaceTabs', 'A4 TOML workspace must participate in unified tabs')
requireText(router, "name: 'TomlEditor'", 'A4 TOML workspace must have an independent route')
requireText(docxKernel, 'MAX_DOCX_FILE_BYTES', 'C1 DOCX parser must enforce the registered file budget')
requireText(docxKernel, 'MAX_DOCX_UNCOMPRESSED_BYTES', 'C1 DOCX parser must enforce an OOXML expansion budget')
requireText(docxKernel, 'MAX_DOCX_BLOCKS', 'C1 DOCX parser must enforce a structured block budget')
requireText(docxKernel, 'parse_styles', 'C1-2A DOCX parser must resolve paragraph style inheritance')
requireText(docxKernel, 'parse_numbering', 'C1-2A DOCX parser must resolve list numbering definitions')
requireText(docxKernel, 'parse_document_relationships', 'C1-2A DOCX parser must resolve internal document relationships')
requireText(docxKernel, 'word/document.xml', 'C1 DOCX parser must require the main OOXML document part')
requireText(docxKernel, 'Event::DocType', 'C1 DOCX parser must reject XML document types')
requireText(docxKernel, 'tracked_changes', 'C1 DOCX compatibility profile must expose tracked changes')
requireText(docxKernel, 'content_controls', 'C1 DOCX compatibility profile must expose content controls')
requireText(docxKernel, 'unknown_word_parts', 'C1 DOCX compatibility profile must expose unknown Word parts')
requireText(docxKernel, 'parses_headings_paragraphs_lists_tables_images_and_breaks', 'C1 DOCX parser must have structured content regression coverage')
requireText(docxKernel, 'reports_advanced_read_only_features_without_dropping_visible_text', 'C1 DOCX parser must retain visible text while profiling advanced objects')
requireText(docxKernel, 'resolves_inherited_heading_numbering_and_internal_image_relationships', 'C1-2A style, numbering and media relationships must have regression coverage')
requireText(docxKernel, 'gridSpan', 'C1-2B2 DOCX parser must preserve horizontal table merges')
requireText(docxKernel, 'vMerge', 'C1-2B2 DOCX parser must preserve vertical table merges')
requireText(docxKernel, 'sectPr', 'C1-2B2 DOCX parser must model section layout properties')
requireText(docxKernel, 'parses_merged_cells_page_breaks_and_section_layout', 'C1-2B2 layout semantics must have regression coverage')
requireText(docxKernel, 'reads_versioned_microsoft_word_producer_fixture', 'C0-2A Microsoft Word producer fixture must have parser regression coverage')
requireText(docxKernel, 'decoded_xml_reference', 'C2B DOCX text reading must preserve predefined and numeric XML references')
requireText(docxKernel, 'preserves_predefined_and_numeric_xml_references_in_visible_text', 'C2B XML reference reading must have regression coverage')
requireText(docxPatchKernel, 'DOCX_EDITABLE_DOCUMENT_PART', 'C2A must restrict the prototype patch to the main document part')
requireText(docxPatchKernel, 'raw_copy_file', 'C2A must raw-copy every unmodified OOXML part')
requireText(docxPatchKernel, 'changed_parts != [DOCX_EDITABLE_DOCUMENT_PART.to_string()]', 'C2A must enforce an exact package-difference allowlist')
requireText(docxPatchKernel, 'parse_docx(&output)', 'C2A must structurally reread isolated output')
requireText(docxPatchKernel, 'patches_real_word_fixture_and_preserves_every_other_part', 'C2A must verify package preservation against the real Word fixture')
requireText(docxPatchKernel, 'rejects_stale_digest_unsafe_xml_and_oversized_patch', 'C2A must cover stale, unsafe, and oversized patch rejection')
requireText(docxPatchKernel, 'DocxEditableTextTarget', 'C2B reads must expose digest-protected semantic text targets')
requireText(docxPatchKernel, 'forbidden_text_carrier', 'C2B must exclude complex paragraph carriers from editing')
requireText(docxPatchKernel, 'MAX_DOCX_EDITABLE_TEXT_CHARS', 'C2B must enforce the Word paragraph text limit')
requireText(docxPatchKernel, 'quick_xml::escape::escape', 'C2B must escape replacement text through the XML library')
requireText(docxPatchKernel, 'build_docx_text_patch_isolated', 'C2B must build text patches through the C2A isolated package kernel')
requireText(docxPatchKernel, 'lists_only_safe_plain_paragraph_and_heading_targets', 'C2B must regress safe target enumeration')
requireText(docxPatchKernel, 'patches_safe_text_semantically_and_rejects_stale_or_complex_targets', 'C2B must regress semantic reread and stable rejection')
requireText(docxPatchKernel, 'row_index: Option<usize>', 'C2C table-cell targets must expose stable row coordinates')
requireText(docxPatchKernel, 'column_index: Option<usize>', 'C2C table-cell targets must expose stable column coordinates')
requireText(docxPatchKernel, 'cell_paragraph_counts', 'C2C must reject multi-paragraph table cells')
requireText(docxPatchKernel, 'cell.column_span != 1', 'C2C must reject horizontally merged table cells')
requireText(docxPatchKernel, 'cell.row_span != 1', 'C2C must reject vertically merged table cells')
requireText(docxPatchKernel, 'lists_safe_list_items_and_unmerged_single_paragraph_table_cells', 'C2C must regress conservative target enumeration')
requireText(docxPatchKernel, 'patches_list_and_table_cell_targets_with_coordinate_stability', 'C2C must regress list and table semantic coordinate stability')
requireText(docxPatchKernel, 'DocxEditableStyleTarget', 'C2D reads must expose digest-protected basic character style targets')
requireText(docxPatchKernel, 'basic_style_safe', 'C2D must reject complex run properties')
requireText(docxPatchKernel, 'build_docx_style_patch_isolated', 'C2D must patch basic styles through the isolated package kernel')
requireText(docxPatchKernel, 'patches_and_clears_basic_character_styles_with_semantic_reread', 'C2D basic styles must have add and clear regression coverage')
requireText(docxPatchKernel, 'DocxEditableImageTarget', 'C2D reads must expose digest-protected inline image targets')
requireText(docxPatchKernel, 'scan_inline_image_metadata', 'C2D must structurally inspect inline image metadata')
requireText(docxPatchKernel, 'build_docx_image_alt_text_patch_isolated', 'C2D must patch image alt text through the isolated package kernel')
requireText(docxPatchKernel, 'patches_and_clears_inline_image_alt_text_without_changing_media', 'C2D image metadata must prove media-byte preservation')
requireText(docxPatchKernel, 'excludes_complex_run_properties_and_floating_images', 'C2D must regress complex style and floating image rejection')
requireText(docxCommands, 'read_docx_document', 'C1 DOCX must expose a dedicated read command')
requireText(docxCommands, 'resolve_existing_file(path, &["docx"])', 'C1 DOCX command must enforce workspace authorization and extension')
requireText(docxCommands, 'MAX_DOCX_MEDIA_BYTES', 'C1-2A DOCX media preview must enforce a per-image budget')
requireText(docxCommands, 'MAX_DOCX_MEDIA_TOTAL_BYTES', 'C1-2A DOCX media preview must enforce a total budget')
requireText(docxCommands, 'valid_media_signature', 'C1-2A DOCX media preview must verify image signatures')
requireText(docxCommands, 'document_part_digest', 'C2A reads must expose the guarded target-part digest')
requireText(docxCommands, 'preview_docx_package_patch_isolated_copy', 'C2A must expose an isolated preview command without a save command')
requireText(docxCommands, 'TemporaryDocxCopy::create', 'C2A must materialize and reopen a temporary copy')
requireText(docxCommands, 'source_after == source', 'C2A must prove that preview leaves the source DOCX unchanged')
requireText(docxCommands, 'previews_c2a_patch_through_temporary_copy_without_changing_source', 'C2A command boundary must have source-preservation regression coverage')
requireText(docxCommands, 'editable_text_targets', 'C2B read reports must publish safe semantic targets')
requireText(docxCommands, 'preview_docx_text_patch_isolated_copy', 'C2B must expose an isolated semantic preview command')
requireText(docxCommands, 'preview_docx_isolated_path', 'C2B must reuse C2A temporary-copy and source-preservation verification')
requireText(docxCommands, 'editable_style_targets', 'C2D read reports must publish safe character style targets')
requireText(docxCommands, 'editable_image_targets', 'C2D read reports must publish safe inline image targets')
requireText(docxCommands, 'preview_docx_style_patch_isolated_copy', 'C2D must expose an isolated basic style preview command')
requireText(docxCommands, 'preview_docx_image_alt_text_patch_isolated_copy', 'C2D must expose an isolated image alt-text preview command')
requireText(docxCommands, 'DocxSaveReadinessReport', 'C2E must retain its structured save readiness report')
requireText(docxCommands, 'audit_docx_save_readiness', 'C2E must retain its save readiness command')
requireText(docxCommands, 'ready_to_save_copy', 'C2E readiness must only permit copy saving after all blockers clear')
requireText(docxCommands, 'fixtures/docx/producers/matrix.json', 'C2E readiness must consume the producer matrix fact source')
requireText(docxCommands, 'producer_evidence_missing:{producer}', 'C2E must report each missing producer from the matrix')
requireText(docxCommands, 'write_attempted: false', 'C2E readiness must prove that it never attempts a write')
requireText(docxCommands, 'c2e_save_readiness_reports_conflicts_without_writing_files', 'C2E must regress source, target, and no-write gates')
requireText(docxCommands, 'save_docx_patch_copy', 'C2E must expose reliable save-as-copy without source overwrite')
requireText(docxCommands, 'save_docx_patch_source', 'UX-33 must expose guarded DOCX source saving')
requireText(docxCommands, 'rollback_protected: true', 'UX-33 DOCX source save must retain rollback protection')
requireText(docxCommands, 'write_new_bytes', 'C2E must use atomic create-new reliable writing')
requireText(docxCommands, 'c2e_reliably_saves_and_reopens_all_three_producer_copies', 'C2E must regress all producer copies')
if (docxCommands.includes('write_docx') || docxCommands.includes('save_docx_overwrite')) failures.push('C2E must not expose DOCX source overwrite commands')
requireText(docxReader, 'Word 页面编辑 · 草稿只驻留内存 · 点击保存才写入', 'UX-33 DOCX workspace must identify explicit-save page editing')
requireText(docxReader, '文档目录', 'C1 DOCX workspace must expose a heading outline')
requireText(docxReader, '搜索 DOCX 正文', 'C1 DOCX workspace must expose in-document search')
requireText(docxReader, '兼容画像', 'C1 DOCX workspace must expose its compatibility profile')
requireText(docxReader, 'save_docx_patch_copy', 'C2E DOCX workspace must expose reliable save-as-copy')
requireText(docxReader, 'save_docx_patch_source', 'UX-33 DOCX workspace must expose guarded source saving')
requireText(docxReader, '覆盖当前 DOCX？', 'UX-33 DOCX source overwrite must require explicit confirmation')
requireText(docxReader, 'media.dataUrl', 'C1-2A DOCX workspace must render verified embedded media')
requireText(docxReader, 'numberingDefinitionCount', 'C1-2A DOCX workspace must expose numbering resolution in its compatibility profile')
requireText(docxReader, 'cell.columnSpan', 'C1-2B2 DOCX workspace must render horizontal table merges')
requireText(docxReader, 'cell.rowSpan', 'C1-2B2 DOCX workspace must render vertical table merges')
requireText(docxReader, 'docx-page-break', 'C1-2B2 DOCX workspace must render pagination markers')
requireText(docxReader, 'docx-layout-summary', 'C1-2B2 DOCX workspace must expose section layout summaries')
requireText(router, "name: 'DocxEditor'", 'C1 DOCX workspace must have a restorable route')
requireText(pptxKernel, 'MAX_PPTX_UNCOMPRESSED_BYTES', 'C3A PPTX parser must bound expanded package bytes')
requireText(pptxKernel, 'parse_relationships', 'C3A PPTX parser must resolve OOXML relationships')
requireText(pptxKernel, 'unknown_presentation_parts', 'C3A PPTX parser must expose unknown-part fidelity risk')
requireText(pptxKernel, 'parses_all_real_pptx_producer_fixtures', 'C3D PPTX parser must reopen all three real producer fixtures')
requireText(pptxKernel, 'rejects_presentations_beyond_the_slide_resource_limit', 'C3C4 PPTX parser must regress the slide-count resource limit')
requireText(pptxKernel, 'PptxTable', 'C3B3 PPTX parser must expose basic table structure')
requireText(pptxKernel, 'line_dash', 'C3B3 PPTX parser must preserve connector styling')
requireText(pptxKernel, 'graphic_type', 'C3B3 PPTX parser must classify complex graphic frames')
requireText(pptxKernel, 'parses_connectors_custom_shapes_tables_and_typed_graphic_frames', 'C3B3 PPTX parser must verify object tiers')
requireText(pptxKernel, 'PptxSearchSegment', 'C3C1 PPTX parser must expose stable search segment metadata')
requireText(pptxKernel, 'pptx_search_segments', 'C3C1 PPTX search text must use one shared generator')
requireText(pptxKernel, 'pptx_slide_location_label', 'C3C3 PPTX search and graph objects must share one slide location label')
requireText(pptxKernel, 'builds_stable_search_segments_for_titles_objects_and_notes', 'C3C1 PPTX search segments must cover titles, objects, and notes')
requireText(pptxEditKernel, 'PptxEditBaselineReport', 'C4A must expose a structured isolated edit baseline report')
requireText(pptxEditKernel, 'source.to_vec()', 'C4A must start from an exact in-memory package clone')
requireText(pptxEditKernel, 'source_parts == isolated_parts', 'C4A must compare every OOXML part by name, size, and digest')
requireText(pptxEditKernel, 'editing_enabled: false', 'C4A must keep editing disabled until a later isolated patch stage')
requireText(pptxEditKernel, 'c4a_preserves_every_part_for_all_real_producers', 'C4A must regress package preservation across all three producers')
requireText(pptxEditKernel, 'PptxEditableTextTarget', 'C4B must expose digest-protected text and notes targets')
requireText(pptxEditKernel, 'forbidden_text_carrier', 'C4B must reject complex text carriers')
requireText(pptxEditKernel, 'raw_copy_file', 'C4B must raw-copy every unmodified OOXML part')
requireText(pptxEditKernel, 'changed_parts != [target.target.part_name.clone()]', 'C4B must enforce an exact one-part difference allowlist')
requireText(pptxEditKernel, 'inspect_pptx_editable_text_targets(&output)', 'C4B must semantically reread the isolated output target')
requireText(pptxEditKernel, 'c4b_patches_safe_slide_text_and_notes_for_all_real_producers', 'C4B must regress text and notes patches across all three producers')
requireText(pptxEditKernel, 'c4b_rejects_stale_digests_and_multiline_or_unknown_targets', 'C4B must regress stale and unsafe patch rejection')
requireText(pptxEditKernel, 'PptxEditableStyleTarget', 'C4C must expose digest-protected single-run character-style targets')
requireText(pptxEditKernel, 'shape-text-style', 'C4C must explicitly classify editable geometric shape text')
requireText(pptxEditKernel, 'PptxEditableAltTextTarget', 'C4C must expose digest-protected picture alt-text targets')
requireText(pptxEditKernel, 'embedded_blip_count == 1', 'C4C must reject external or ambiguous picture carriers')
requireText(pptxEditKernel, 'verify_isolated_part_change', 'C4C style and alt-text patches must share the exact one-part allowlist')
requireText(pptxEditKernel, 'inspect_pptx_editable_style_targets(&output)', 'C4C must semantically reread character styles')
requireText(pptxEditKernel, 'inspect_pptx_editable_alt_text_targets(&output)', 'C4C must semantically reread picture alt text')
requireText(pptxEditKernel, 'c4c_patches_safe_styles_and_alt_text_for_all_real_producers', 'C4C must regress style and alt-text patches across all three producers')
requireText(pptxEditKernel, 'c4c_rejects_stale_digests_and_unsafe_style_or_alt_text', 'C4C must reject stale and unsafe metadata patches')
requireText(pptxEditKernel, 'PptxEditableImageTarget', 'C5A must expose digest-protected unshared image targets')
requireText(pptxEditKernel, 'reference_count != 1', 'C5A must reject shared image parts')
requireText(pptxEditKernel, 'MAX_PPTX_REPLACEMENT_IMAGE_BYTES', 'C5A must enforce a bounded replacement image payload')
requireText(pptxEditKernel, 'replacement_mime_type != target.mime_type', 'C5A must keep the existing media format and relationship')
requireText(pptxEditKernel, 'verify_isolated_part_change(source, &output, &target.part_name)', 'C5A must enforce an exact one-media-part difference')
requireText(pptxEditKernel, 'inspect_pptx_editable_image_targets(&output)', 'C5A must semantically reread the replaced image target')
requireText(pptxEditKernel, 'c5a_replaces_one_unshared_image_part_for_all_real_producers', 'C5A must regress isolated image patches across all three producers')
requireText(pptxEditKernel, 'c5a_rejects_stale_digest_mime_change_oversize_and_noop', 'C5A must regress unsafe image replacement rejection')
requireText(knowledgeIndex, 'build_pptx_index_segments', 'C3C1 persistent index must consume shared PPTX search segments')
requireText(index, 'build_pptx_index_segments', 'C3C1 live fallback must consume shared PPTX search segments')
requireText(index, 'indexes_pptx_slides_objects_and_notes_consistently', 'C3C1 must regress ready-index and live-fallback consistency')
requireText(index, 'pptx_index_lifecycle_rebuilds_falls_back_and_removes_deleted_objects', 'C3C4 must regress PPTX rebuild, stale fallback, deletion cleanup, and index removal')
requireText(library, "result.objectType === 'pptx'", 'C3C2 Library search must route PPTX results inside the shared workspace')
requireText(library, "void refreshKnowledgeIndexStatus()", 'C3C4 Library must refresh visible index lifecycle state')
requireText(library, 'nextKnowledgeLocatorToken', 'C3C2 repeated PPTX result clicks must issue fresh locator tokens')
requireText(library, 'locatorKind: result.locatorKind', 'C3C2 Library search must preserve PPTX locator kinds')
requireText(pptxReader, 'resolvePptxRouteLocator', 'C3C2 PPTX workspace must resolve stable slide and object locators')
requireText(pptxReader, '<Teleport to="body">', 'C3D PPTX slideshow must escape Library container clipping')
requireText(pptxReader, 'route.query.locatorToken', 'C3C2 PPTX workspace must react to repeated locator requests')
requireText(pptxReader, 'routeLocatorRun', 'C3C2 PPTX workspace must prevent stale async locator requests from winning')
requireText(pptxReader, 'scrollIntoView', 'C3C2 PPTX workspace must reveal the target thumbnail')
requireText(pptxReader, 'route-target-object', 'C3C2 PPTX workspace must highlight located objects separately')
requireText(pptxReader, "route.query.matchKind === 'notes'", 'C3C2 notes results must reveal the details panel')
requireText(pptxReader, 'setRelationObjectFocus', 'C3C3 PPTX slide selection must update the shared relation context')
requireText(pptxCommands, 'read_pptx_presentation', 'C3A PPTX reader command must remain registered')
requireText(pptxCommands, 'audit_pptx_edit_baseline', 'C4A must expose an isolated edit-baseline audit command')
requireText(pptxCommands, 'TemporaryPptxCopy::create', 'C4A must materialize and reopen a temporary PPTX copy')
requireText(pptxCommands, 'source_after == source', 'C4A must prove the source PPTX remains byte-identical')
requireText(pptxCommands, 'expected_signature', 'C4A must reject stale source snapshots')
requireText(pptxCommands, 'preview_pptx_text_patch_isolated_copy', 'C4B must expose a temporary-copy-only text patch preview')
requireText(pptxCommands, 'preview_pptx_text_patch_path', 'C4B must reuse signature, temporary-copy, and source-preservation checks')
requireText(pptxCommands, 'preview_pptx_metadata_patch_path', 'C4C must reuse signature, temporary-copy, and source-preservation checks')
requireText(pptxCommands, 'preview_pptx_style_patch_isolated_copy', 'C4C must expose only an isolated character-style preview command')
requireText(pptxCommands, 'preview_pptx_alt_text_patch_isolated_copy', 'C4C must expose only an isolated alt-text preview command')
requireText(pptxCommands, 'preview_pptx_image_patch_isolated_copy', 'C5A must expose only an isolated image replacement preview command')
requireText(pptxCommands, 'decode_pptx_replacement_image', 'C5A must bound and validate Base64 before package rebuilding')
requireText(pptxCommands, 'PptxPatchOperation', 'C4D must unify text, style, and image-alt-text save operations')
requireText(pptxCommands, 'save_pptx_patch_copy', 'C4D must expose only a reliable save-copy command')
requireText(pptxCommands, 'write_new_bytes', 'C4D must reuse atomic create-new reliable writing')
requireText(pptxCommands, 'target_path == source_path', 'C4D must reject source overwrite')
requireText(pptxCommands, 'target_path.exists()', 'C4D must reject an existing save target')
requireText(pptxCommands, 'expected_output_digest', 'C4D save must bind to the verified preview output')
requireText(pptxCommands, 'build_pptx_operation(&source, operation)', 'C4D save must rebuild the verified operation before writing')
requireText(pptxCommands, 'parse_pptx(&saved)', 'C4D must structurally reopen the saved copy')
requireText(pptxCommands, 'remove_created_pptx_if_exact', 'C4D must clean only its exact failed output')
requireText(pptxCommands, 'external_producer_reopen_required: true', 'C4D must explicitly defer external producer reopen to C4E')
requireText(pptxReader, 'prepareEditBaseline', 'C4A PPTX workspace must expose edit preparation inside the existing reader')
requireText(pptxReader, '所有操作均在隔离副本中验证', 'C5D UI must disclose the isolated edit boundary')
requireText(pptxReader, '源 PPTX 始终只读', 'C5D UI must disclose that the source presentation remains read-only')
requireText(pptxReader, 'C4B 隔离文本预览', 'C4B controls must remain inside the existing PPTX details panel')
requireText(pptxReader, 'preview_pptx_text_patch_isolated_copy', 'C4B workspace must invoke only the isolated preview command')
requireText(pptxReader, 'C4C 样式与无障碍预览', 'C4C controls must remain inside the existing PPTX details panel')
requireText(pptxReader, 'preview_pptx_style_patch_isolated_copy', 'C4C workspace must invoke the isolated style preview command')
requireText(pptxReader, 'preview_pptx_alt_text_patch_isolated_copy', 'C4C workspace must invoke the isolated alt-text preview command')
requireText(pptxReader, 'C5A 隔离图片替换', 'C5A controls must remain inside the existing PPTX details panel')
requireText(pptxReader, 'preview_pptx_image_patch_isolated_copy', 'C5A workspace must invoke the isolated image preview command')
requireText(pptxReader, '共享图片、格式变化和新增关系均会被拒绝', 'C5A UI must disclose the shared-media and relationship boundary')
requireText(pptxReader, 'C4D 可靠另存副本', 'C4D save controls must remain inside the existing PPTX details panel')
requireText(pptxReader, 'save_pptx_patch_copy', 'C4D workspace must invoke only the reliable save-copy command')
requireText(pptxReader, '不覆盖源文件或已有目标', 'C4D UI must disclose its no-overwrite boundary')
requireText(pptxCommands, 'preview_pptx_slide_lifecycle_isolated_copy', 'C5C must expose one guarded slide lifecycle preview command')
requireText(pptxCommands, 'build_pptx_slide_lifecycle_operation', 'C5C preview and save must share the same operation dispatcher')
requireText(pptxReader, 'C5C 幻灯片管理', 'C5C controls must remain inside the existing PPTX details panel')
requireText(pptxReader, 'slideOrderTargetIds', 'C5C workspace must preserve stable target identities while reordering')
requireText(await read('scripts/verify-c5c-pptx-slide-output-reopen.ps1'), 'PowerPoint.Application', 'C5C must retain real PowerPoint output reopen automation')
requireText(await read('scripts/verify-c5c-pptx-slide-output-reopen.ps1'), 'KWPP.Application', 'C5C must retain real WPS output reopen automation')
requireText(await read('scripts/verify-c5c-pptx-slide-output-reopen.ps1'), '--convert-to", "pdf"', 'C5C must retain isolated LibreOffice output rendering')
requireText(await read('scripts/verify-c5c-pptx-slide-output-reopen.ps1'), 'RequireComplete', 'C5C must expose an explicit 3/3 release gate')
requireText(await read('scripts/verify-c4e-pptx-producer-reopen.ps1'), 'PowerPoint.Application', 'C4E must retain real Microsoft PowerPoint output reopen automation')
requireText(await read('scripts/verify-c4e-pptx-producer-reopen.ps1'), 'KWPP.Application', 'C4E must retain real WPS Presentation output reopen automation')
requireText(await read('scripts/verify-c4e-pptx-producer-reopen.ps1'), '--convert-to", "pdf"', 'C4E must retain isolated LibreOffice Impress reopen/render automation')
requireText(await read('scripts/verify-c4e-pptx-producer-reopen.ps1'), 'RequireComplete', 'C4E must expose an explicit 3/3 release gate')
requireText(await read('scripts/check-c4e-pptx-output-reopen.mjs'), "producerById.get('wps-presentation')?.status !== 'verified'", 'C4E1 must preserve real WPS output reopen evidence')
requireText(pptxCommands, 'WorkspaceGuard::new(&library_root)', 'C3C2 PPTX reader must create its workspace guard per request')
requireText(pptxReader, 'libraryRoot: store.libraryPath', 'C3C2 PPTX workspace must provide the guarded library root')
for (const forbiddenPptxWrite of ['write_pptx', 'overwrite_pptx', 'save_pptx_overwrite']) {
  if (pptxCommands.includes(forbiddenPptxWrite)) failures.push(`C4D must not expose unsafe PPTX write command: ${forbiddenPptxWrite}`)
}
requireText(pptxReader, '基础编辑副本 · 原文件不写回', 'C5D PPTX workspace must identify its bounded copy-edit capability')
requireText(pptxReader, '搜索 PPTX 文本与备注', 'C3A PPTX workspace must expose in-presentation search')
requireText(pptxReader, '放映', 'C3A PPTX workspace must expose read-only presentation mode')
requireText(pptxReader, '兼容画像', 'C3A PPTX workspace must expose its compatibility profile')
requireText(pptxReader, 'mediaByPart', 'C3A PPTX workspace must render verified embedded media')
requireText(pptxReader, 'v-for="object in slide.objects"', 'C3B3 PPTX thumbnails must reuse parsed slide objects')
requireText(pptxReader, '<PptxObjectContent', 'C3B3 PPTX canvases must use the shared object renderer')
requireText(pptxObjectContent, 'object.graphicType === \'table\'', 'C3B3 PPTX renderer must render basic tables')
requireText(pptxObjectContent, 'graphicLabel', 'C3B3 PPTX renderer must present typed read-only graphic cards')
requireText(pptxObjectContent, 'connectorStyle', 'C3B3 PPTX renderer must present connector geometry and styling')
requireText(router, "name: 'PptxReader'", 'C3A PPTX workspace must have a restorable route')
const logFormat = registry.formats.find(format => format.id === 'log')
if (!logFormat
  || logFormat.routeName !== 'LogViewer'
  || logFormat.capabilities?.read !== 'supported'
  || logFormat.capabilities?.edit !== 'supported'
  || logFormat.capabilities?.index !== 'supported'
  || logFormat.userCapability?.level !== 'basic-edit'
  || logFormat.userCapability?.saveMode !== 'overwrite'
  || logFormat.adapters?.reader !== 'text'
  || logFormat.adapters?.writer !== 'text') failures.push('A4 LOG professional viewer and guarded editor contract is incomplete')
requireText(logViewer, "'read_text_document_range'", 'A4 LOG viewer must use bounded range reads')
requireText(logViewer, 'readTailRange', 'A4 LOG viewer must enter large files from a bounded tail window')
requireText(logViewer, 'pollForUpdates', 'A4 LOG viewer must refresh appended records')
requireText(logViewer, 'LEVEL_PATTERNS', 'A4 LOG viewer must classify common log levels')
requireText(logViewer, 'MAX_BUFFER_CHARS', 'A4 LOG viewer must bound its in-memory display buffer')
requireText(logViewer, "'write_log_document'", 'A4 LOG editor must use its guarded writer')
requireText(logViewer, 'acknowledgedOverwrite: true', 'A4 LOG source overwrite must require explicit acknowledgement')
requireText(logViewer, 'MAX_LOG_EDIT_BYTES', 'A4 LOG editor must enforce its bounded edit lane')
requireText(logViewer, '...codeMirrorThemeExtensions', 'A4 LOG editor must use the shared code editor theme')
requireText(formatCommands, 'pub async fn write_log_document', 'A4 LOG saves must use a dedicated backend boundary')
requireText(formatCommands, 'acknowledged_overwrite: bool', 'A4 LOG backend must require overwrite acknowledgement')
requireText(formatCommands, 'if format_id == "log"', 'A4 generic text writes must reject LOG bypasses')
requireText(library, '<WorkspaceTabs', 'Markdown workspace must consume unified session tabs')
requireText(textEditor, '<WorkspaceTabs', 'TXT workspace must consume unified session tabs')
requireText(workspaceTabs, 'routeForFile', 'unified tabs must route each registered format to its workspace')
requireText(frontend, 'LIBRARY_EMBEDDED_EDITOR_ROUTES', 'daily source editors must declare the shared library-shell contract')
for (const routeName of ['TextEditor', 'JsonEditor', 'YamlEditor', 'XmlEditor', 'TomlEditor', 'DocxEditor', 'PptxReader', 'LogViewer']) {
  requireText(frontend, `'${routeName}'`, `${routeName} must remain registered for right-pane embedding`)
}
requireText(library, '<component :is="activeEmbeddedEditor"', 'library mode must mount daily source editors in its right pane')
requireText(library, 'library-embedded-editor', 'embedded editors must use the shared visual shell')
requireText(library, 'opensInLibraryShell(format)', 'library file selection must retain the management shell')
requireText(workspaceTabs, 'opensInLibraryShell', 'unified tabs must retain the library shell for managed files')
requireText(app, 'opensInLibraryShell', 'command palette file results must retain the library shell')
requireText(canvas, 'opensInLibraryShell', 'canvas file nodes must retain the library shell for daily formats')
requireText(workspaceTabs, 'tab.isDirty', 'unified tabs must confirm before discarding dirty drafts')
requireText(appStore, '.filter(tab => !tab.external)', 'external authorization tabs must not survive process restart')
requireText(app, 'confirmDiscardUnsaved', 'application exit must coordinate dirty session tabs')
requireText(app, "'pick_external_openable_file'", 'external picker must accept every registered externally openable format')
requireText(externalWindows, 'external=1', 'external TXT windows must retain their authorization context')
forbid(settings, /TXT 自动保存/, 'settings must not promise background TXT writes')
requireText(files, 'file_format_registry()', 'workspace scanning must consume registry')
requireText(externalAccess, 'file_format_for_path', 'external authorization must consume registry')
requireText(index, 'format.adapters.indexer', 'index dispatch must consume registered adapters')
requireText(index, 'indexer == "docx"', 'DOCX live search must consume the dedicated parser')
requireText(knowledgeIndex, 'indexer == "docx"', 'DOCX snapshot indexing must consume the dedicated parser')
requireText(docxReader, 'report.model.relatedContent', 'DOCX reader must render parsed related content')
requireText(docxReader, 'route.query.locator', 'DOCX reader must consume object locators from global search')
requireText(library, 'CREATABLE_FILE_FORMATS', 'creation menu must derive from registry')
requireText(library, 'activeFormatCanEdit', 'text workspace save action must consume format edit capability')
requireText(library, 'format-capability-badge', 'text workspace must display user-visible capability tiers')
requireText(library, 'activeDocumentFormat?.userCapability.label', 'file tree must expose registered capability labels')
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
