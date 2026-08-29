import crypto from 'node:crypto'
import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const policy = readJson('shared/post-v115-m4c6-controlled-conversion-exit-audit-policy.json')
const predecessor = readJson('shared/post-v115-m4c5-graph-canvas-eligibility-and-snapshot-disclosure-policy.json')
const csvTable = readJson('shared/post-v115-m4c1-csv-tsv-table-disclosure-and-auto-open-policy.json')
const opmlCanvas = readJson('shared/post-v115-m4c2-opml-canvas-projection-disclosure-policy.json')
const graphProject = readJson('shared/post-v115-m4c4-graph-project-note-disclosure-policy.json')
const graphCanvas = predecessor
const development = readJson('shared/development-version-policy.json')
const successor = readJson('shared/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection-policy.json')
const cleanupImplementation = readJson('shared/post-v115-m4d1-bounded-generated-graph-export-artifact-cleanup-policy.json')
const cleanupExit = readJson('shared/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit-policy.json')
const capabilityDecision = readJson('shared/post-v115-m4e0-capability-facts-residual-risks-and-version-decision-audit-policy.json')
const evidencePath = 'docs/evidence/post-v115-m4c6-controlled-conversion-exit-audit/exit-evidence.json'
const evidence = readJson(evidencePath)
const manifest = readJson('docs/evidence/post-v115-m4c6-controlled-conversion-exit-audit/manifest.json')
const tableView = read('src/views/TableView.vue')
const mindmapView = read('src/views/MindMapView.vue')
const graphView = read('src/components/GraphView.vue')
const failures = []

if (policy.stage !== 'M4C-6' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M4C-6 predecessor chain drifted')
if (policy.closureDecision !== 'passed-bounded-conversion-scope' || policy.workflowFamilies?.map(item => item.id).join(',') !== 'csv-tsv-to-table,opml-to-canvas,graph-to-project-note,graph-to-canvas') failures.push('bounded conversion closure scope drifted')
if (csvTable.targetFormat !== 'longedit-table' || opmlCanvas.targetFormat !== 'canvas' || graphProject.targetFormat !== 'markdown' || graphCanvas.targetFormat !== 'json-canvas') failures.push('selected workflow target contracts drifted')
for (const gate of ['prewriteDisclosureComplete', 'cancelCreatesNoTarget', 'collisionCreatesNumberedTarget', 'actualTargetAutomaticallyOpened', 'targetRereadMatchesBoundedProjection', 'wideAndNarrowDialogReadable', 'sourceAndExistingTargetsUnchanged', 'runtimeErrorsZero']) if (policy.exitGates?.[gate] !== true) failures.push(`M4C exit gate missing: ${gate}`)
for (const [source, token] of [[tableView, "data-testid': 'm4c1-table-conversion-disclosure'"], [mindmapView, "data-testid': 'm4c2-opml-canvas-projection-disclosure'"], [graphView, "data-testid': 'm4c4-graph-project-note-disclosure'"], [graphView, "data-testid': 'm4c5-graph-canvas-disclosure'"]]) if (!source.includes(token)) failures.push(`conversion disclosure marker missing: ${token}`)
for (const source of [tableView, mindmapView, graphView]) if (!source.includes('viewportWidth = window.innerWidth')) failures.push('viewport-based disclosure sizing correction is missing')
if (evidence.stage !== 'M4C-6' || evidence.status !== 'passed' || evidence.protectedFileCount !== 10 || evidence.sourceUserContentIncluded !== false) failures.push('M4C-6 evidence envelope is invalid')
const actual = evidence.actual || {}
for (const family of ['csvTable', 'opmlCanvas', 'graphProject', 'graphCanvas']) {
  for (const gate of ['disclosures', 'cancelPreventedWrites', 'autoOpenedNumberedTargets', 'targetReread', 'responsive']) if (!actual[gate]?.[family]) failures.push(`${family} combined gate failed: ${gate}`)
}
if (!actual.protectedFilesUnchanged || actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved || actual.workflowCount !== 4) failures.push('combined source safety, runtime or workflow count failed')
if (JSON.stringify(evidence.initialHashes) !== JSON.stringify(evidence.finalHashes)) failures.push('protected file hashes changed')
const evidenceBytes = fs.readFileSync(evidencePath)
if (manifest.evidenceSha256 !== sha256(evidenceBytes) || manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 8) failures.push('M4C-6 evidence integrity or visual review failed')
for (const screenshot of manifest.screenshots || []) { const bytes = fs.readFileSync(`docs/evidence/post-v115-m4c6-controlled-conversion-exit-audit/${screenshot.file}`); if (screenshot.bytes !== bytes.length || screenshot.sha256 !== sha256(bytes)) failures.push(`screenshot integrity failed: ${screenshot.file}`) }
if (policy.selectedNextStage?.id !== successor.stage || policy.selectedNextStage?.name !== successor.name || successor.predecessor !== policy.stage || successor.selectedNextStage?.id !== cleanupImplementation.stage || cleanupImplementation.predecessor !== successor.stage || cleanupImplementation.selectedNextStage?.id !== cleanupExit.stage || cleanupExit.predecessor !== cleanupImplementation.stage || cleanupExit.selectedNextStage?.id !== capabilityDecision.stage || capabilityDecision.predecessor !== cleanupExit.stage || development.currentStage !== `${capabilityDecision.selectedNextStage.id}-${capabilityDecision.selectedNextStage.name}`) failures.push('M4 successor handoff is not aligned')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) { console.error(`M4C-6 controlled conversion exit check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M4C closed: four bounded file-producing workflows passed combined disclosure, cancel, collision, auto-open, reread, responsive and source-safety gates.')
