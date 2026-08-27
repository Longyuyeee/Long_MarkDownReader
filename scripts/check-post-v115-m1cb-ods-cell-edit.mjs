import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = file => readFile(new URL(file, root), 'utf8')
const [evidenceText, registryText, backend, engine, view, tauriLib] = await Promise.all([
  read('docs/evidence/post-v115-m1cb-ods-cell-edit/audit.json'),
  read('shared/file-formats.json'),
  read('src-tauri/src/commands/odf_content.rs'),
  read('src-tauri/src/formats/odf_edit.rs'),
  read('src/views/OdfContentReaderView.vue'),
  read('src-tauri/src/lib.rs'),
])
const evidence = JSON.parse(evidenceText)
const registry = JSON.parse(registryText)
const failures = []
const requireFact = (condition, message) => { if (!condition) failures.push(message) }
const requireText = (source, value, message) => requireFact(source.includes(value), message)

requireFact(evidence.schemaVersion === 1 && evidence.stage === 'M1C-B-ODS-bounded-cell-value' && evidence.status === 'passed', 'M1C-B evidence identity drifted')
requireFact(evidence.expected?.value === evidence.actual?.uiReopenedValue && evidence.expected?.value === evidence.actual?.libreOfficeA1, 'M1C-B expected/UI/LibreOffice values differ')
requireFact(evidence.actual?.sourceUnchanged === true && evidence.actual?.sourceBeforeSha256 === evidence.actual?.sourceAfterSha256, 'M1C-B source package changed')
requireFact(evidence.actual?.undoRedo === true && evidence.actual?.explicitCopySave === true && evidence.actual?.responsive960x720 === true && evidence.actual?.runtimeErrors === 0, 'M1C-B desktop interaction evidence is incomplete')
requireFact(evidence.actual?.libreOfficePdfBytes > 1000 && evidence.decision?.nextStage === 'M1C-C-ODS-formula-and-style-feasibility' && evidence.decision?.releaseCandidate === false, 'M1C-B producer reopen or next-stage decision drifted')
requireFact(evidence.privacy?.localAbsolutePathsIncluded === false && evidence.privacy?.userDocumentBodiesIncluded === false, 'M1C-B privacy boundary drifted')

const fixture = await readFile(new URL('src-tauri/tests/fixtures/odf-content/longedit-e1c-spreadsheet.ods', root))
requireFact(createHash('sha256').update(fixture).digest('hex') === evidence.actual?.sourceBeforeSha256, 'M1C-B real fixture digest drifted')
for (const file of evidence.evidenceFiles || []) {
  try { requireFact((await stat(new URL(`docs/evidence/post-v115-m1cb-ods-cell-edit/${file}`, root))).size > 10_000, `M1C-B screenshot ${file} is trivial`) }
  catch { failures.push(`M1C-B screenshot ${file} is missing`) }
}
const ods = registry.formats?.find(item => item.id === 'ods')
const odp = registry.formats?.find(item => item.id === 'odp')
requireFact(ods?.capabilities?.edit === 'supported' && ods?.userCapability?.level === 'basic-edit' && ods?.userCapability?.saveMode === 'copy' && ods?.adapters?.writer === 'odf-cell-value' && ods?.externalPolicy === 'preview', 'M1C-B ODS public capability is inaccurate')
requireFact(odp?.capabilities?.edit === 'unsupported' && odp?.userCapability?.level === 'preview-only' && odp?.adapters?.writer === null, 'M1C-B must not widen ODP')
for (const token of ['build_ods_cell_value_patch_isolated', 'expected_source_signature', 'write_new_bytes(target_path, &output)', 'source_unchanged: true', 'save_mode: "new_copy_only"']) requireText(backend, token, `M1C-B save command is missing ${token}`)
for (const token of ['formula-readonly', 'merged-cell', 'repeated-cell', 'unchanged_parts_verified', 'semantic_reparse_verified']) requireText(engine, token, `M1C-B isolated patch gate is missing ${token}`)
for (const token of ['m1cb-ods-edit-banner', 'm1cb-ods-cell-editor', 'undoDraft', 'redoDraft', 'saveCopy', 'onBeforeRouteLeave', '另存 ODS 副本']) requireText(view, token, `M1C-B workspace is missing ${token}`)
requireText(tauriLib, 'save_ods_cell_value_copy', 'M1C-B Tauri command is not registered')
requireFact(!/[A-Z]:\\Users\\|[A-Z]:\\Project\\/i.test(evidenceText), 'M1C-B evidence exposes a local absolute path')

if (failures.length) {
  console.error('M1C-B ODS bounded cell edit contract failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('M1C-B ODS bounded cell edit verified: real desktop draft, undo/redo, reliable copy, source preservation and LibreOffice reopen.')
