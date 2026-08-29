import crypto from 'node:crypto'
import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const policy = readJson('shared/post-v115-m4c4-graph-project-note-disclosure-policy.json')
const predecessor = readJson('shared/post-v115-m4c3-graph-derived-output-disclosure-selection-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4c4-graph-project-note-disclosure/interaction-evidence.json')
const manifest = readJson('docs/evidence/post-v115-m4c4-graph-project-note-disclosure/manifest.json')
const development = readJson('shared/development-version-policy.json')
const successor = readJson('shared/post-v115-m4c5-graph-canvas-eligibility-and-snapshot-disclosure-policy.json')
const exitAudit = readJson('shared/post-v115-m4c6-controlled-conversion-exit-audit-policy.json')
const cleanupSelection = readJson('shared/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection-policy.json')
const cleanupImplementation = readJson('shared/post-v115-m4d1-bounded-generated-graph-export-artifact-cleanup-policy.json')
const cleanupExit = readJson('shared/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit-policy.json')
const view = read('src/components/GraphView.vue')
const canvas = read('src-tauri/src/commands/canvas.rs')
const graph = read('src-tauri/src/commands/graph.rs')
const failures = []

if (policy.stage !== 'M4C-4' || policy.predecessor !== predecessor.stage || predecessor.selection?.id !== policy.stage) failures.push('M4C-4 predecessor chain drifted')
if (policy.sourceFormats?.join(',') !== 'markdown,pdf' || policy.targetFormat !== 'markdown' || policy.disclosureContract?.generationFacts?.length !== 7) failures.push('project-note disclosure scope drifted')
for (const token of ['m4c4-create-project-note', 'requestCreateProjectNote', 'm4c4-graph-project-note-disclosure', '中心来源：', '关系范围：', '候选目标：', '生成规则与边界：', '最多写入 100 个', '不会与图谱或中心来源自动同步', '中心来源和其他关联文件保持不变', "window.dispatchEvent(new CustomEvent('longedit:library-file-created'", 'await openManagedFile(router, path)']) if (!view.includes(token)) failures.push(`project-note disclosure UI marker missing: ${token}`)
for (const token of ['MAX_GRAPH_PROJECT_NODES: usize = 100', 'resolve_existing_file(center_path, &["md", "pdf"])', 'related.sort_by', 'related.truncate(MAX_GRAPH_PROJECT_NODES)', '另有 {} 个关联对象未写入', 'longedit-generated: graph-project', 'write_utf8(&target, &content)?']) if (!canvas.includes(token)) failures.push(`project-note backend boundary missing: ${token}`)
if (!graph.includes('let max_depth = depth.clamp(1, 4);')) failures.push('local graph depth boundary drifted')
const actual = evidence.actual || {}
if (!actual.disclosureComplete1280 || !actual.disclosureComplete480 || !actual.cancelPreventedWrite || !actual.firstTargetAutoOpened || !actual.numberedTargetAutoOpened) failures.push('disclosure, cancel or automatic-open evidence failed')
if (actual.firstTargetName !== 'Graph First 项目.md' || actual.numberedTargetName !== 'Graph Collision 项目 1.md' || !actual.firstTargetReread || !actual.numberedTargetReread) failures.push('target naming or reread evidence failed')
if (actual.firstRelatedCount !== 100 || actual.numberedRelatedCount !== 100 || actual.firstOmittedCount !== 2 || actual.numberedOmittedCount !== 2 || !actual.sortedAndTruncated || !actual.traceableMetadata || !actual.fixedTemplateObserved || !actual.centerBodyNotCopied) failures.push('project-note generation boundary evidence failed')
if (!actual.sourcesUnchanged || !actual.responsive1280 || !actual.responsive480 || actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved) failures.push('source safety, responsive or runtime evidence failed')
const evidenceBytes = fs.readFileSync('docs/evidence/post-v115-m4c4-graph-project-note-disclosure/interaction-evidence.json')
if (manifest.evidenceSha256 !== sha256(evidenceBytes) || manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 4) failures.push('M4C-4 evidence integrity or visual review failed')
for (const screenshot of manifest.screenshots || []) {
  const bytes = fs.readFileSync(`docs/evidence/post-v115-m4c4-graph-project-note-disclosure/${screenshot.file}`)
  if (screenshot.bytes !== bytes.length || screenshot.sha256 !== sha256(bytes)) failures.push(`screenshot integrity failed: ${screenshot.file}`)
}
if (policy.selectedNextStage?.id !== successor.stage || successor.predecessor !== policy.stage || successor.selectedNextStage?.id !== exitAudit.stage || exitAudit.predecessor !== successor.stage || exitAudit.selectedNextStage?.id !== cleanupSelection.stage || cleanupSelection.predecessor !== exitAudit.stage || cleanupSelection.selectedNextStage?.id !== cleanupImplementation.stage || cleanupImplementation.predecessor !== cleanupSelection.stage || cleanupImplementation.selectedNextStage?.id !== cleanupExit.stage || cleanupExit.predecessor !== cleanupImplementation.stage || development.currentStage !== `${cleanupExit.selectedNextStage.id}-${cleanupExit.selectedNextStage.name}`) failures.push('M4C successor handoff is not aligned')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) {
  console.error(`M4C-4 graph project-note disclosure check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4C-4 accepted: graph project notes disclose their bounded generated snapshot, preserve sources, cap related objects and open collision-safe targets.')
