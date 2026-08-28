import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const policy = readJson('shared/post-v115-m4a5-docx-heading-ods-sheet-graph-location-coverage-policy.json')
const evidenceDirectory = 'docs/evidence/post-v115-m4a5-docx-heading-ods-sheet-graph-location-coverage'
const evidence = readJson(path.join(evidenceDirectory, 'interaction-evidence.json'))
const manifest = readJson(path.join(evidenceDirectory, 'manifest.json'))
const graph = read('src-tauri/src/commands/graph.rs')
const context = read('src/components/FileRelationContext.vue')
const navigation = read('src/services/fileNavigation.ts')
const semantics = readJson('shared/graph-semantics.json')
const failures = []

if (policy.stage !== 'M4A-5' || policy.predecessor !== 'M4A-4' || policy.selectedNextStage?.id !== 'M4A-6') failures.push('stage chain is invalid')
if (policy.bounds?.docxHeadingsPerDocument !== 512 || policy.bounds?.odsSheetsPerDocument !== 128 || policy.bounds?.docxDeferredBlockLimit !== 50000 || policy.bounds?.odsDeferredCellLimit !== 200000) failures.push('selected/deferred bounds drifted')
for (const token of ['MAX_DOCX_GRAPH_HEADINGS: usize = 512', 'MAX_ODS_GRAPH_SHEETS: usize = 128', 'add_docx_document', 'add_ods_document', 'docx_heading_parent_id', 'object_type: "docx_heading"', 'kind: "docx-block"', 'object_type: "ods_sheet"', 'kind: "ods-sheet"', 'docx_headings_and_ods_sheets_are_bounded_stable_graph_objects', 'docx_outline_uses_nearest_preceding_smaller_numeric_heading_level']) if (!graph.includes(token)) failures.push(`implementation token missing: ${token}`)
for (const id of policy.expectations.explicitObjectTypes) if (!semantics.objectTypes.some(item => item.id === id)) failures.push(`explicit semantic missing: ${id}`)
if (!context.includes("docx_heading: 'DOCX 标题'") || !context.includes("ods_sheet: 'ODS 工作表'")) failures.push('relation-context labels are missing')
if (!context.includes('node.locator?.kind && node.locator.objectId') || !navigation.includes("/^(?:docx|odt|ods|odp)-/.test(kind)")) failures.push('generic internal-object focus/navigation contract is missing')
const actual = evidence.actual
if (evidence.status !== 'passed' || actual?.graph?.parentCount !== 2 || actual?.graph?.childCount !== 3 || actual?.graph?.containsRelationCount !== 3 || actual?.graph?.structuralMentionCount !== 0) failures.push('real graph counts are invalid')
if (actual?.graph?.docxHeadingCount !== 1 || actual?.graph?.odsSheetCount !== 2 || actual?.graph?.deferredFineGrainedNodeCount !== 0) failures.push('selected/deferred real fixture granularity is invalid')
if (actual?.graphInternalOpenCount !== 2 || actual?.relationContextInternalOpenCount !== 2 || actual?.returnedGraphCount !== 4) failures.push('real precise-open/return coverage is incomplete')
if (actual?.runtimeErrorCount !== 0 || actual?.blockingErrorSurfaceObserved || !actual?.sourceFilesUnchanged) failures.push('runtime/source-safety gate failed')
if (manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 3) failures.push('visual evidence is not accepted')
const evidenceBytes = fs.readFileSync(path.join(evidenceDirectory, manifest.evidenceFile))
if (crypto.createHash('sha256').update(evidenceBytes).digest('hex') !== manifest.evidenceSha256) failures.push('evidence digest mismatch')
for (const screenshot of manifest.screenshots || []) { const file = path.join(evidenceDirectory, screenshot.file); if (!fs.existsSync(file) || fs.statSync(file).size !== screenshot.bytes || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== screenshot.sha256) failures.push(`screenshot integrity failed: ${screenshot.file}`) }
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || manifest.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) {
  console.error(`M4A-5 DOCX/ODS graph location coverage failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4A-5 accepted: 2 parents, 1 DOCX heading, 2 ODS sheets and 3 mention-free outline/container relations open precisely from Graph and relation context.')
