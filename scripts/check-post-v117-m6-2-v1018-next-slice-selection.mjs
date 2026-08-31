import fs from 'node:fs'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const text = file => fs.readFileSync(file, 'utf8')
const policy = json('shared/post-v117-m6-2-v1018-next-slice-selection-policy.json')
const predecessor = json('shared/post-v117-m6-1-graph-fullscreen-policy.json')
const development = json('shared/development-version-policy.json')
const successor = json('shared/post-v117-m6-3-v1018-release-readiness-policy.json')
const candidatePackaging = json('shared/post-v117-m6-4-v1018-candidate-packaging-policy.json')
const hostedLifecycle = json('shared/post-v117-m6-5-v1018-hosted-installer-lifecycle-policy.json')
const finalReadiness = fs.existsSync('shared/post-v117-m6-6-v1018-final-artifact-manifest-release-readiness-policy.json')
  ? json('shared/post-v117-m6-6-v1018-final-artifact-manifest-release-readiness-policy.json') : null
const graph = text('src/components/GraphView.vue')
const yaml = text('src/views/YamlEditorView.vue')
const xml = text('src/views/XmlEditorView.vue')
const toml = text('src/views/TomlEditorView.vue')
const odfEdit = text('src-tauri/src/formats/odf_edit.rs')
const audit = text('docs/Post_v1.0.17_M6_2_v1.0.18_Next_Slice_Selection_Audit_2026-08-31.md')
const roadmap = text('docs/Post_v1.0.17_v1.0.18_Professional_Capability_Roadmap_2026-08-31.md')
const alignment = text('docs/Development_Alignment_and_Closure_Plan_2026-08-02.md')
const failures = []
const fail = message => failures.push(message)

if (policy.schemaVersion !== 1 || policy.stage !== 'M6-2' || policy.status !== 'scope-selected' || policy.predecessor !== predecessor.stage
  || predecessor.status !== 'accepted' || predecessor.selectedNextStage?.id !== policy.stage || predecessor.selectedNextStage?.name !== policy.name) fail('M6-2 identity/predecessor drift')
if (policy.runtimeBaseVersion !== '1.0.17' || policy.publicVersion !== '1.0.17' || policy.developmentTargetVersion !== '1.0.18'
  || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M6-2 version/privacy boundary drift')
const selected = policy.candidates?.filter(candidate => candidate.selected)
if (selected?.length !== 1 || selected[0].id !== 'v1018-quality-debt-and-release-readiness'
  || policy.selectedNextStage?.id !== 'M6-3' || policy.selectedNextStage?.name !== 'v1.0.18-quality-debt-and-release-readiness'
  || policy.nextAction !== 'execute-m6-3-v1.0.18-quality-debt-and-release-readiness') fail('M6-2 selection drift')
for (const requirement of ['completeRustSuiteRequired', 'completePatchReleaseGateRequired', 'm6FullscreenEvidenceMustRemainAccepted', 'allUnexpectedFailuresMustBeReproducedAndFixed', 'expectedVsActualRequired', 'versionTransitionOnlyAfterFullPass', 'releaseCandidateOnlyAfterPackagingAndLifecycle']) {
  if (policy.nextStageRequirements?.[requirement] !== true) fail(`M6-3 requirement drift: ${requirement}`)
}
if (policy.nextStageRequirements?.productCodeChanges !== false || policy.nextStageRequirements?.binaryVersionChange !== false) fail('M6-3 code/version boundary drift')
for (const token of ['data-testid="graph-fullscreen"', 'container.requestFullscreen()', ':aria-label="graphFullscreenActive']) if (!graph.includes(token)) fail(`M6-1 accepted capability missing ${token}`)
if (graph.includes('data-testid="graph-cluster-collapse"') || graph.includes('data-testid="graph-node-governance-ring"')) fail('M6-2 deferred graph boundary drift')
for (const source of [yaml, xml, toml]) if (['schemaProvider', 'schemaUri', '$schema'].some(token => source.includes(token))) fail('M6-2 structured schema boundary drift')
if (!odfEdit.includes('notes_depth')) fail('M6-2 ODP notes boundary drift')
const expectedDevelopmentStage = finalReadiness?.status === 'accepted-ready-to-publish'
  ? 'M6-7-v1.0.18-tag-release-and-remote-asset-verification'
  : hostedLifecycle.status === 'hosted-installer-lifecycle-passed-release-readiness-pending'
  ? 'M6-6-v1.0.18-final-artifact-manifest-and-release-readiness-audit'
  : candidatePackaging.status === 'accepted'
  ? `${candidatePackaging.selectedNextStage.id}-${candidatePackaging.selectedNextStage.name}`
  : successor.status === 'accepted' ? `${successor.selectedNextStage.id}-${successor.selectedNextStage.name}` : 'M6-3-v1.0.18-quality-debt-and-release-readiness'
if (development.currentStage !== expectedDevelopmentStage || !['1.0.17', '1.0.18'].includes(development.runtimeBaseVersion)
  || development.publicVersion !== '1.0.17' || development.developmentTargetVersion !== '1.0.18' || development.releaseCandidate) fail('M6-3 handoff drift')
for (const [document, tokens] of [[audit, ['M6-3', 'ci:patch-release', '为什么停止扩大范围', '预期与当前实际']], [roadmap, ['M6-2 选择回执', 'M6-3', '停止扩大']], [alignment, successor.status === 'accepted' ? ['M6-2 已完成', '唯一接续点为 M6-3'] : ['当前阶段：**M6-3 v1.0.18 质量债与发布就绪审计**', '唯一接续点为 M6-3']]]) {
  for (const token of tokens) if (!document.includes(token)) fail(`M6-2 document missing ${token}`)
}

if (failures.length) {
  console.error(`M6-2 next-slice selection failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M6-2 accepted: stop feature expansion and run M6-3 complete Rust plus patch-release readiness gates before any v1.0.18 version transition.')
