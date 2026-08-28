import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const policy = readJson('shared/post-v115-m4a2-m1-object-graph-coverage-selection-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4a2-m1-object-graph-coverage-selection/selection-evidence.json')
const manifest = readJson('docs/evidence/post-v115-m4a2-m1-object-graph-coverage-selection/manifest.json')
const graph = read('src-tauri/src/commands/graph.rs')
const semantics = readJson('shared/graph-semantics.json')
const successor = readJson('shared/post-v115-m4a3-workbook-odp-graph-location-coverage-policy.json')
const failures = []

if (policy.stage !== 'M4A-2' || policy.selectedNextStage?.id !== 'M4A-3') failures.push('selection stage or successor is invalid')
if (policy.candidates?.filter(item => item.selection === 'selected').map(item => item.format).join(',') !== 'ODP,Workbook') failures.push('selected formats are not frozen to ODP and Workbook')
if (policy.candidates?.find(item => item.format === 'DOCX')?.parserLimit !== 50000 || policy.candidates?.find(item => item.format === 'ODS')?.parserLimit !== 200000) failures.push('high-cardinality deferral limits are missing')
if (evidence.status !== 'passed' || evidence.actual?.searchLocators?.length !== 4 || evidence.actual?.graph?.candidateNodeCount !== 0) failures.push('real search/graph gap evidence is incomplete')
if (evidence.actual?.parsedObjects?.workbook?.sheets !== 4 || evidence.actual?.parsedObjects?.odp?.slides < 1) failures.push('real selected-format parser evidence is incomplete')
if (evidence.actual?.selection?.structuralRelationType !== 'contains' || evidence.actual?.selection?.structuralMentionCount !== 0) failures.push('structural relation and mention contract is invalid')
if (!evidence.actual?.sourceFilesUnchanged || evidence.actual?.runtimeErrorCount !== 0 || evidence.actual?.blockingErrorSurfaceObserved) failures.push('desktop source-safety or runtime gate failed')
if (manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 2) failures.push('desktop screenshots have not completed visual review')
if (successor.predecessor !== policy.stage || policy.selectedNextStage?.id !== successor.stage) failures.push('implemented successor does not preserve the selection chain')
for (const token of ['".pptx"', '".odp"', '".xlsx"']) if (!graph.includes(token)) failures.push(`accepted graph dispatch is missing for ${token}`)
for (const id of ['odp', 'odp_slide', 'workbook', 'workbook_sheet']) if (!semantics.objectTypes.some(item => item.id === id)) failures.push(`selected successor object semantics missing: ${id}`)
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) {
  console.error(`M4A-2 object graph coverage selection check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4A-2 selection accepted: pre-implementation evidence is preserved and the approved M4A-3 Workbook/ODP successor is implemented.')
