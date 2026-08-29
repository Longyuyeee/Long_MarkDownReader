import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const policy = readJson('shared/post-v115-m4c3-graph-derived-output-disclosure-selection-policy.json')
const predecessor = readJson('shared/post-v115-m4c2-opml-canvas-projection-disclosure-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4c3-graph-derived-output-disclosure-selection/selection-evidence.json')
const manifest = readJson('docs/evidence/post-v115-m4c3-graph-derived-output-disclosure-selection/manifest.json')
const development = readJson('shared/development-version-policy.json')
const successor = readJson('shared/post-v115-m4c4-graph-project-note-disclosure-policy.json')
const graphCanvas = readJson('shared/post-v115-m4c5-graph-canvas-eligibility-and-snapshot-disclosure-policy.json')
const exitAudit = readJson('shared/post-v115-m4c6-controlled-conversion-exit-audit-policy.json')
const cleanupSelection = readJson('shared/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection-policy.json')
const cleanupImplementation = readJson('shared/post-v115-m4d1-bounded-generated-graph-export-artifact-cleanup-policy.json')
const cleanupExit = readJson('shared/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit-policy.json')
const capabilityDecision = readJson('shared/post-v115-m4e0-capability-facts-residual-risks-and-version-decision-audit-policy.json')
const freezeEntry = readJson('shared/post-v115-m4f0-v1016-release-freeze-entry-audit-policy.json')
const transition = readJson('shared/post-v115-m4f1-v1016-atomic-version-transition-policy.json')
const view = read('src/components/GraphView.vue')
const canvas = read('src-tauri/src/commands/canvas.rs')
const graph = read('src-tauri/src/commands/graph.rs')
const failures = []

if (policy.stage !== 'M4C-3' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M4C-3 predecessor chain drifted')
if (policy.candidates?.length !== 2 || policy.candidates.filter(item => item.selected).map(item => item.id).join() !== 'graph-project-note') failures.push('exactly the graph project note must be selected')
for (const token of ["invoke<string>('create_canvas_from_graph'", "invoke<string>('create_project_note_from_graph'", 'openManagedFile(router, path)', "['markdown', 'pdf'].includes(node.objectType)"]) if (!view.includes(token)) failures.push(`Graph output frontend fact missing: ${token}`)
for (const token of ['resolve_local_graph_center(&guard, &center_path)?', 'build_local_graph(canonical_root.clone(), canonical_center.clone(), depth)', 'MAX_GRAPH_PROJECT_NODES: usize = 100', 'related.sort_by', 'related.truncate(MAX_GRAPH_PROJECT_NODES)', 'longedit-generated: graph-project', 'write_utf8(&target, &content)?']) if (!canvas.includes(token)) failures.push(`Graph output backend fact missing: ${token}`)
if (!graph.includes('pub(crate) fn resolve_local_graph_center') || !graph.includes('["md", "pdf", "csv", "tsv", "json"]') || !graph.includes('let max_depth = depth.clamp(1, 4);')) failures.push('corrected local graph eligibility/depth fact drifted')
const actual = evidence.actual || {}
if (!actual.noPrewriteDisclosureCanvas || !actual.noPrewriteDisclosureProject || !actual.canvasAutoOpened || !actual.projectAutoOpened) failures.push('current UI disclosure/open behavior evidence failed')
if (actual.canvasFirstName !== 'Graph Center 思维导图.canvas' || actual.canvasNumberedName !== 'Graph Center 思维导图 1.canvas' || actual.projectFirstName !== 'Graph Center 项目.md' || actual.projectNumberedName !== 'Graph Center 项目 1.md') failures.push('target naming evidence failed')
if (actual.canvasNodeCount !== 2 || actual.canvasEdgeCount !== 2 || !actual.canvasRelativeFileNodes || !actual.canvasRelationTypesPreserved) failures.push('Canvas snapshot structure evidence failed')
if (!actual.projectTraceable || !actual.projectTemplateObserved || actual.projectRelatedCount !== 1 || !actual.sourcesUnchanged || actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved) failures.push('project-note/source/runtime evidence failed')
if (!actual.responsive1280 || !actual.responsive480 || manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 4) failures.push('responsive or visual review evidence failed')
if (policy.selection?.id !== successor.stage || policy.selection?.name !== successor.name || successor.predecessor !== policy.stage || successor.selectedNextStage?.id !== graphCanvas.stage || graphCanvas.predecessor !== successor.stage || graphCanvas.selectedNextStage?.id !== exitAudit.stage || exitAudit.predecessor !== graphCanvas.stage || exitAudit.selectedNextStage?.id !== cleanupSelection.stage || cleanupSelection.predecessor !== exitAudit.stage || cleanupSelection.selectedNextStage?.id !== cleanupImplementation.stage || cleanupImplementation.predecessor !== cleanupSelection.stage || cleanupImplementation.selectedNextStage?.id !== cleanupExit.stage || cleanupExit.predecessor !== cleanupImplementation.stage || cleanupExit.selectedNextStage?.id !== capabilityDecision.stage || capabilityDecision.predecessor !== cleanupExit.stage || capabilityDecision.selectedNextStage?.id !== freezeEntry.stage || freezeEntry.predecessor !== capabilityDecision.stage || freezeEntry.selectedNextStage?.id !== transition.stage || transition.predecessor !== freezeEntry.stage || development.currentStage !== `${transition.selectedNextStage.id}-${transition.selectedNextStage.name}`) failures.push('M4 successor handoff is not aligned')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) {
  console.error(`M4C-3 graph output selection check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4C-3 accepted: the recorded project-note-first selection remains intact and the deferred graph Canvas eligibility drift is now closed by M4C-5.')
