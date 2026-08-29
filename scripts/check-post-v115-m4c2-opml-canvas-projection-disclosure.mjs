import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const policy = readJson('shared/post-v115-m4c2-opml-canvas-projection-disclosure-policy.json')
const predecessor = readJson('shared/post-v115-m4c1-csv-tsv-table-disclosure-and-auto-open-policy.json')
const successor = readJson('shared/post-v115-m4c3-graph-derived-output-disclosure-selection-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4c2-opml-canvas-projection-disclosure/interaction-evidence.json')
const manifest = readJson('docs/evidence/post-v115-m4c2-opml-canvas-projection-disclosure/manifest.json')
const development = readJson('shared/development-version-policy.json')
const view = read('src/views/MindMapView.vue')
const command = read('src-tauri/src/commands/mindmap.rs')
const format = read('src-tauri/src/formats/opml.rs')
const failures = []

if (policy.stage !== 'M4C-2' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M4C-2 predecessor chain drifted')
if (policy.disclosureContract?.projectionFacts?.length !== 8 || !policy.disclosureContract.sourceLibraryRelativePath || !policy.disclosureContract.candidateTargetLibraryRelativePath || !policy.disclosureContract.numberedCollisionTarget || !policy.disclosureContract.automaticOpenActualTarget) failures.push('OPML projection disclosure contract drifted')
for (const token of ['m4c2-project-to-canvas', 'm4c2-opml-canvas-projection-disclosure', '投影规则与损失', 'OPML 的 head 元数据', 'Canvas 是当前已保存 OPML 的独立快照', '原 OPML 文件保持不变', 'await openManagedFile(router, canvas)']) if (!view.includes(token)) failures.push(`OPML projection UI marker missing: ${token}`)
for (const token of ['MAX_OPML_BYTES', 'MAX_OPML_NODES', 'MAX_OPML_DEPTH', 'validate_canvas_json(&content)?', 'write_utf8(&target, &content)?', 'format!("{stem} 画布 {index}.canvas")']) if (!`${command}\n${format}`.includes(token)) failures.push(`OPML projection backend boundary missing: ${token}`)
const actual = evidence.actual || {}
if (!actual.disclosureComplete1280 || !actual.disclosureComplete480 || !actual.firstTargetAutoOpened || !actual.numberedTargetAutoOpened) failures.push('disclosure or automatic-open evidence failed')
if (!actual.firstTargetReread || !actual.numberedTargetReread || actual.firstTargetName !== 'Conversion Outline 画布.canvas' || actual.numberedTargetName !== 'Conversion Outline 画布 1.canvas') failures.push('target naming or reread evidence failed')
if (actual.targetNodeCount !== 5 || actual.targetEdgeCount !== 4 || !actual.sourceFileNodeObserved || !actual.titleNoteProjectionObserved || !actual.containsHierarchyObserved || !actual.lossFieldsAbsent) failures.push('Canvas projection structure evidence failed')
if (!actual.sourceUnchanged || !actual.sourceFilesUnchangedAfterAudit || !actual.responsive1280 || !actual.responsive480 || actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved) failures.push('source safety, responsive or runtime gate failed')
if (manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 4) failures.push('M4C-2 screenshots have not completed visual review')
if (policy.selectedNextStage?.id !== successor.stage || successor.predecessor !== policy.stage || development.currentStage !== `${successor.selection.id}-${successor.selection.name}`) failures.push('M4C-3 handoff is not aligned')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) {
  console.error(`M4C-2 OPML Canvas projection check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4C-2 accepted: OPML to Canvas discloses projection facts, preserves the source, creates numbered targets and opens the actual result automatically.')
