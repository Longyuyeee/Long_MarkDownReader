import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const policy = readJson('shared/post-v115-m4a3-workbook-odp-graph-location-coverage-policy.json')
const semantics = readJson('shared/graph-semantics.json')
const evidence = readJson('docs/evidence/post-v115-m4a3-workbook-odp-graph-location-coverage/interaction-evidence.json')
const manifest = readJson('docs/evidence/post-v115-m4a3-workbook-odp-graph-location-coverage/manifest.json')
const graph = read('src-tauri/src/commands/graph.rs')
const graphView = read('src/components/GraphView.vue')
const relationContext = read('src/components/FileRelationContext.vue')
const failures = []

if (policy.stage !== 'M4A-3' || policy.predecessor !== 'M4A-2' || policy.selectedNextStage?.id !== 'M4A-4') failures.push('stage chain is invalid')
for (const token of ['add_workbook_document', 'add_odp_document', 'object_type: "workbook_sheet"', 'object_type: "odp_slide"', 'workbook_sheets_and_odp_slides_are_stable_graph_and_index_objects']) {
  if (!graph.includes(token)) failures.push(`graph implementation token missing: ${token}`)
}
for (const id of policy.expectations.explicitObjectTypes) if (!semantics.objectTypes.some(item => item.id === id)) failures.push(`explicit graph semantic missing: ${id}`)
if (!graphView.includes('store.setRelationObjectFocus') || !relationContext.includes('node.locator?.kind && node.locator.objectId')) failures.push('shared internal-object focus is not preserved by both graph consumers')
const actual = evidence.actual || {}
if (actual.graph?.parentCount !== 2 || actual.graph?.childCount !== 6 || actual.graph?.containsRelationCount !== 6 || actual.graph?.structuralMentionCount !== 0) failures.push('real graph object or structural relation counts are invalid')
if (actual.graphInternalOpenCount !== 2 || actual.relationContextInternalOpenCount !== 2 || actual.returnedGraphCount !== 4) failures.push('real graph/relation-context navigation coverage is incomplete')
if (actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved || !actual.sourceFilesUnchanged) failures.push('runtime or source-safety gate failed')
if (manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 3) failures.push('visual evidence is not accepted')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) {
  console.error(`M4A-3 Workbook/ODP graph location coverage failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4A-3 accepted: 2 parents, 6 internal objects and 6 mention-free contains relations open precisely from Graph and relation context.')
