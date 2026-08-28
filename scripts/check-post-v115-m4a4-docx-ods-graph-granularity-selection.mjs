import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const policy = readJson('shared/post-v115-m4a4-docx-ods-graph-granularity-selection-policy.json')
const evidenceDirectory = 'docs/evidence/post-v115-m4a4-docx-ods-graph-granularity-selection'
const evidence = readJson(path.join(evidenceDirectory, 'selection-evidence.json'))
const manifest = readJson(path.join(evidenceDirectory, 'manifest.json'))
const docx = read('src-tauri/src/formats/docx.rs')
const odf = read('src-tauri/src/formats/odf_content.rs')
const graph = read('src-tauri/src/commands/graph.rs')
const navigation = read('src/services/fileNavigation.ts')
const odfReader = read('src/views/OdfContentReaderView.vue')
const semantics = readJson('shared/graph-semantics.json')
const failures = []

if (policy.stage !== 'M4A-4' || policy.predecessor !== 'M4A-3' || policy.selectedNextStage?.id !== 'M4A-5') failures.push('stage chain is invalid')
if (policy.scaleFacts?.docxBlockParserLimit !== 50000 || policy.scaleFacts?.odsCellParserLimit !== 200000 || policy.scaleFacts?.odsSheetParserLimit !== 128) failures.push('parser scale facts drifted')
if (policy.scaleFacts?.naiveMaximumNodesWithParents !== 250002 || policy.scaleFacts?.naiveMaximumContainsRelations !== 250000) failures.push('naive graph scale calculation drifted')
if (policy.selection?.docx?.childObjectType !== 'docx_heading' || policy.selection?.docx?.maximumChildrenPerDocument !== 512 || policy.selection?.docx?.locatorKind !== 'docx-block' || !policy.selection?.docx?.hierarchy?.includes('smaller numeric level')) failures.push('DOCX heading selection is invalid')
if (policy.selection?.ods?.childObjectType !== 'ods_sheet' || policy.selection?.ods?.maximumChildrenPerDocument !== 128 || policy.selection?.ods?.locatorKind !== 'ods-sheet') failures.push('ODS sheet selection is invalid')
if (policy.selection?.maximumSelectedNodesWithParentsPerDocumentPair !== 642 || policy.selection?.structuralRelationType !== 'contains' || policy.selection?.structuralMentionCount !== 0) failures.push('bounded selected graph contract drifted')
if (!docx.includes('const MAX_DOCX_BLOCKS: usize = 50_000') || !docx.includes('pub headings: Vec<DocxHeading>') || !docx.includes('block_id: id.clone()')) failures.push('DOCX parser does not support the recorded heading selection')
for (const token of ['const MAX_ODS_SHEETS: usize = 128', 'const MAX_ODS_CELLS: usize = 200_000', 'id: format!("ods-sheet-{index}")']) if (!odf.includes(token)) failures.push(`ODS parser fact missing: ${token}`)
if (!navigation.includes("/^(?:docx|odt|ods|odp)-/.test(kind)") || !odfReader.includes("locator.startsWith('ods-sheet-')")) failures.push('selected locators are not consumed by shared navigation/readers')
if (evidence.status !== 'passed' || evidence.actual?.existingSearchLocators?.length !== 2 || evidence.actual?.directSelectionLocators?.length !== 2 || !evidence.actual.directSelectionLocators.every(item => item.precise)) failures.push('real locator evidence is incomplete')
if (evidence.actual?.graphBeforeImplementation?.candidateNodeCount !== 0 || evidence.actual?.scale?.naive?.nodesWithParents !== 250002 || evidence.actual?.scale?.selected?.nodesWithParentsPerDocumentPair !== 642) failures.push('pre-implementation graph/scale evidence is invalid')
if (evidence.actual?.selection?.docxChildType !== 'docx_heading' || evidence.actual?.selection?.odsChildType !== 'ods_sheet' || evidence.actual?.selection?.nextStage !== 'M4A-5') failures.push('recorded selection differs from policy')
if (evidence.actual?.runtimeErrorCount !== 0 || evidence.actual?.blockingErrorSurfaceObserved || !evidence.actual?.sourceFilesUnchanged) failures.push('runtime/source-safety gate failed')
if (manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 2) failures.push('visual evidence is not accepted')
const evidenceBytes = fs.readFileSync(path.join(evidenceDirectory, manifest.evidenceFile))
if (crypto.createHash('sha256').update(evidenceBytes).digest('hex') !== manifest.evidenceSha256) failures.push('evidence digest mismatch')
for (const screenshot of manifest.screenshots || []) { const file = path.join(evidenceDirectory, screenshot.file); if (!fs.existsSync(file) || fs.statSync(file).size !== screenshot.bytes || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== screenshot.sha256) failures.push(`screenshot integrity failed: ${screenshot.file}`) }
for (const extension of ['".docx"', '".ods"']) if (graph.includes(extension)) failures.push(`selection audit must precede graph dispatch for ${extension}`)
for (const id of ['docx', 'docx_heading', 'ods', 'ods_sheet']) if (semantics.objectTypes.some(item => item.id === id)) failures.push(`selection audit must precede object semantics for ${id}`)
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || manifest.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) {
  console.error(`M4A-4 DOCX/ODS graph granularity selection failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`M4A-4 selection accepted: ${evidence.actual.parsedObjects.docx.headings}/${evidence.actual.parsedObjects.docx.blocks} real DOCX headings/blocks and ${evidence.actual.parsedObjects.ods.sheets}/${evidence.actual.parsedObjects.ods.cells} ODS sheets/cells support bounded M4A-5 heading/sheet graph coverage.`)
