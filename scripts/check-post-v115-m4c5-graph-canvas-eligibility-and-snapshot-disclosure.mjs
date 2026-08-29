import crypto from 'node:crypto'
import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const policy = readJson('shared/post-v115-m4c5-graph-canvas-eligibility-and-snapshot-disclosure-policy.json')
const predecessor = readJson('shared/post-v115-m4c4-graph-project-note-disclosure-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4c5-graph-canvas-eligibility-and-snapshot-disclosure/interaction-evidence.json')
const manifest = readJson('docs/evidence/post-v115-m4c5-graph-canvas-eligibility-and-snapshot-disclosure/manifest.json')
const development = readJson('shared/development-version-policy.json')
const exitAudit = readJson('shared/post-v115-m4c6-controlled-conversion-exit-audit-policy.json')
const cleanupSelection = readJson('shared/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection-policy.json')
const cleanupImplementation = readJson('shared/post-v115-m4d1-bounded-generated-graph-export-artifact-cleanup-policy.json')
const cleanupExit = readJson('shared/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit-policy.json')
const view = read('src/components/GraphView.vue')
const canvas = read('src-tauri/src/commands/canvas.rs')
const graph = read('src-tauri/src/commands/graph.rs')
const failures = []

if (policy.stage !== 'M4C-5' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M4C-5 predecessor chain drifted')
if (policy.sourceFormats?.join(',') !== 'markdown,pdf,csv,tsv,longedit-table' || policy.targetFormat !== 'json-canvas' || policy.disclosureContract?.snapshotFacts?.length !== 8) failures.push('graph Canvas eligibility or snapshot scope drifted')
for (const token of ['m4c5-send-to-canvas', 'canSendToCanvas', "['markdown', 'pdf', 'table'].includes(node.objectType)", 'requestSendToCanvas', 'm4c5-graph-canvas-disclosure', '创建独立 Canvas 关系快照？', '内部 locator', '多个内部对象可能指向同一源文件', '按关系深度重新排布', '不会自动双向同步', "window.dispatchEvent(new CustomEvent('longedit:library-file-created'", 'await openManagedFile(router, path)']) if (!view.includes(token)) failures.push(`graph Canvas disclosure UI marker missing: ${token}`)
for (const token of ['resolve_local_graph_center(&guard, &center_path)?', 'build_local_graph(canonical_root.clone(), canonical_center.clone(), depth)', 'graph_to_canvas_json(&graph', '"type": "file"', '"relationType": edge.relation_type', 'if edge.directed { "arrow" } else { "none" }']) if (!canvas.includes(token)) failures.push(`graph Canvas backend boundary missing: ${token}`)
for (const token of ['pub(crate) fn resolve_local_graph_center', '["md", "pdf", "csv", "tsv", "json"]', '仅支持开放 Table JSON 作为表格中心对象', 'let max_depth = depth.clamp(1, 4);']) if (!graph.includes(token)) failures.push(`local graph eligibility boundary missing: ${token}`)
const actual = evidence.actual || {}
if (actual.positiveCenterTypes?.join(',') !== 'Graph Center.md,Paper.pdf,Data.csv,Data.tsv,Data Board.table.json' || !actual.genericJsonRejected || !actual.opmlRejected || !actual.canvasRejected) failures.push('positive or negative center eligibility evidence failed')
if (!actual.opmlActionDisabled || !actual.canvasActionDisabled || !actual.internalActionDisabled || !actual.markdownActionEnabled || !actual.tableActionEnabled) failures.push('frontend action eligibility evidence failed')
if (!actual.disclosureComplete1280 || !actual.disclosureComplete480 || !actual.cancelPreventedWrite || !actual.firstTargetAutoOpened || !actual.numberedTargetAutoOpened) failures.push('disclosure, cancel or automatic-open evidence failed')
if (actual.firstTargetName !== 'Graph Center 思维导图.canvas' || actual.numberedTargetName !== 'Data Board 思维导图 1.canvas' || actual.firstNodeCount !== 2 || actual.firstEdgeCount !== 1 || actual.numberedNodeCount !== 2 || actual.numberedEdgeCount !== 1) failures.push('target naming or Canvas structure evidence failed')
if (!actual.tableInternalLocatorLossObserved || !actual.canvasNodesAreBoundedFiles || !actual.relationProjectionObserved || !actual.depthLayoutAndColorsObserved) failures.push('snapshot projection and loss evidence failed')
if (!actual.sourcesUnchanged || !actual.responsive1280 || !actual.responsive480 || actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved) failures.push('source safety, responsive or runtime evidence failed')
const evidenceBytes = fs.readFileSync('docs/evidence/post-v115-m4c5-graph-canvas-eligibility-and-snapshot-disclosure/interaction-evidence.json')
if (manifest.evidenceSha256 !== sha256(evidenceBytes) || manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 4) failures.push('M4C-5 evidence integrity or visual review failed')
for (const screenshot of manifest.screenshots || []) { const bytes = fs.readFileSync(`docs/evidence/post-v115-m4c5-graph-canvas-eligibility-and-snapshot-disclosure/${screenshot.file}`); if (screenshot.bytes !== bytes.length || screenshot.sha256 !== sha256(bytes)) failures.push(`screenshot integrity failed: ${screenshot.file}`) }
if (policy.selectedNextStage?.id !== exitAudit.stage || exitAudit.predecessor !== policy.stage || exitAudit.selectedNextStage?.id !== cleanupSelection.stage || cleanupSelection.predecessor !== exitAudit.stage || cleanupSelection.selectedNextStage?.id !== cleanupImplementation.stage || cleanupImplementation.predecessor !== cleanupSelection.stage || cleanupImplementation.selectedNextStage?.id !== cleanupExit.stage || cleanupExit.predecessor !== cleanupImplementation.stage || development.currentStage !== `${cleanupExit.selectedNextStage.id}-${cleanupExit.selectedNextStage.name}`) failures.push('M4C-6 successor handoff is not aligned')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) { console.error(`M4C-5 graph Canvas eligibility and snapshot disclosure check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M4C-5 accepted: graph Canvas eligibility is aligned across UI and backend, snapshot losses are disclosed, sources remain unchanged, and actual numbered targets open automatically.')
