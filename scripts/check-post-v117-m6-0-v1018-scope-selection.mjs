import crypto from 'node:crypto'
import fs from 'node:fs'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const text = file => fs.readFileSync(file, 'utf8')
const newlineVariants = file => {
  const raw = fs.readFileSync(file)
  const lf = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'))
  const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'))
  return [raw, lf, crlf]
}
const matchesSha256 = (file, expected) => newlineVariants(file).some(bytes => crypto.createHash('sha256').update(bytes).digest('hex') === expected)
const policy = json('shared/post-v117-m6-0-v1018-scope-selection-policy.json')
const successor = json('shared/post-v117-m6-1-graph-fullscreen-policy.json')
const evidence = json('docs/evidence/post-v117-m6-0-v1018-scope-selection/selection-evidence.json')
const development = json('shared/development-version-policy.json')
const graph = text('src/components/GraphView.vue')
const app = text('src/App.vue')
const store = text('src/store/app.ts')
const yaml = text('src/views/YamlEditorView.vue')
const xml = text('src/views/XmlEditorView.vue')
const toml = text('src/views/TomlEditorView.vue')
const odp = text('src/views/OdfContentReaderView.vue')
const odfEdit = text('src-tauri/src/formats/odf_edit.rs')
const historicGraph = json('docs/evidence/post-v115-m3b8-remaining-navigation-selection/desktop.json')
const combinedGraph = json('docs/evidence/post-v115-m3b12-professional-visual-system-exit/desktop-dark-reduced.json')
const audit = text('docs/Post_v1.0.17_M6_0_v1.0.18_Scope_Selection_Audit_2026-08-31.md')
const roadmap = text('docs/Post_v1.0.17_v1.0.18_Professional_Capability_Roadmap_2026-08-31.md')
const alignment = text('docs/Development_Alignment_and_Closure_Plan_2026-08-02.md')
const failures = []
const fail = message => failures.push(message)

if (policy.schemaVersion !== 1 || policy.stage !== 'M6-0' || policy.status !== 'scope-selected' || policy.predecessor !== 'M5-9') fail('M6-0 identity drift')
if (policy.runtimeBaseVersion !== '1.0.17' || policy.publicVersion !== '1.0.17' || policy.developmentTargetVersion !== '1.0.18' || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M6-0 version/privacy boundary drift')
const selected = policy.candidates?.filter(candidate => candidate.selected)
if (selected?.length !== 1 || selected[0].id !== 'graph-bounded-fullscreen-lifecycle' || policy.selectedNextStage?.id !== 'M6-1'
  || policy.selectedNextStage?.name !== 'knowledge-graph-bounded-fullscreen-lifecycle-and-real-desktop-audit'
  || policy.nextAction !== 'execute-m6-1-knowledge-graph-bounded-fullscreen-lifecycle-and-real-desktop-audit') fail('M6-0 selection drift')
for (const requirement of ['graphOnly', 'sourceFilesRemainReadOnly', 'explicitToolbarEntry', 'browserFullscreenApiOnly', 'fullscreenChangeIsSourceOfTruth', 'escapeAndBrowserExitSupported', 'routeUnmountCleanupRequired', 'selectionPanelsCameraAndMinimapPreserved', 'resizeObserverAndCanvasRefitRequired', 'realTauriThreeViewportAuditRequired', 'darkLightAndReducedMotionEvidenceRequired', 'expectedVsActualRequired', 'noClusterProxyOrGraphSemanticChange']) {
  if (policy.nextStageRequirements?.[requirement] !== true) fail(`M6-1 requirement drift: ${requirement}`)
}
if (policy.nextStageRequirements?.binaryVersionChange !== false) fail('M6-1 binary version boundary drift')

for (const token of ['ResizeObserver', 'data-testid="graph-minimap"', 'requestCameraPose', 'detectGraphCommunities']) if (!graph.includes(token)) fail(`graph foundation missing ${token}`)
if (successor.status === 'accepted') {
  for (const token of ['data-testid="graph-fullscreen"', 'requestFullscreen()']) if (!graph.includes(token)) fail(`M6-1 progression missing ${token}`)
} else {
  for (const absent of ['data-testid="graph-fullscreen"', 'requestFullscreen()']) if (graph.includes(absent)) fail(`M6-0 current graph fact drifted: ${absent}`)
}
if (graph.includes('data-testid="graph-cluster-collapse"')) fail('M6-0 cluster-collapse boundary drifted')
if (!app.includes("if (e.key === 'F11')") || !app.includes('store.toggleZen()') || !store.includes('toggleZen()')) fail('existing zen-mode fact drifted')
if (app.includes('requestFullscreen()') || store.includes('requestFullscreen()')) fail('zen mode unexpectedly became native fullscreen')
for (const [name, source] of [['yaml', yaml], ['xml', xml], ['toml', toml]]) {
  for (const token of ['$schema', 'schemaProvider', 'schemaUri']) if (source.includes(token)) fail(`${name} schema baseline drifted: ${token}`)
}
if (!odp.includes('selectedSlide.notes') || !odfEdit.includes('notes_depth')) fail('ODP note read-only boundary drift')

const hashes = evidence.actual?.sourceHashes ?? {}
for (const [key, file] of [['yamlViewSha256', 'src/views/YamlEditorView.vue'], ['xmlViewSha256', 'src/views/XmlEditorView.vue'], ['tomlViewSha256', 'src/views/TomlEditorView.vue'], ['odpViewSha256', 'src/views/OdfContentReaderView.vue']]) {
  if (!matchesSha256(file, hashes[key])) fail(`M6-0 source hash drift: ${file}`)
}
if (successor.status !== 'accepted' && !matchesSha256('src/components/GraphView.vue', hashes.graphViewSha256)) fail('M6-0 graph source hash drift')
const real = historicGraph.actual?.remainingNavigationSelection
if (real?.viewports?.length !== 3 || !real.viewports.every(item => item.fits && item.fullscreenApiAvailable && !item.fullscreenVisible && !item.clusterCollapseExpandVisible)
  || real.community?.interactionKind !== 'filtered-subgraph' || historicGraph.actual?.runtimeErrors !== 0 || !historicGraph.actual?.sourceFilesUnchanged || !historicGraph.actual?.returnedToLibrary) fail('M3B-8 real desktop baseline drift')
const deferred = combinedGraph.actual?.visualSystemExit?.deferred
if (combinedGraph.actual?.runtimeErrors !== 0 || !combinedGraph.actual?.sourceFilesUnchanged || !combinedGraph.actual?.returnedToLibrary
  || deferred?.fullscreenVisible || deferred?.clusterCollapseExpandVisible || deferred?.governanceRingVisible) fail('M3B-12 combined graph baseline drift')
if (evidence.stage !== 'M6-0' || evidence.status !== 'accepted' || evidence.actual?.selectedCandidate !== selected[0].id || evidence.differences?.length !== 4
  || evidence.selectedNextStage !== 'M6-1-knowledge-graph-bounded-fullscreen-lifecycle-and-real-desktop-audit' || evidence.releaseCandidate || evidence.sourceUserContentIncluded) fail('M6-0 selection evidence drift')
const developmentStageAccepted = successor.status === 'accepted'
  ? /^M[678]-[0-9]+-/.test(development.currentStage)
  : development.currentStage === evidence.selectedNextStage
if (!developmentStageAccepted || !['1.0.17', '1.0.18', '1.0.19', '1.0.20'].includes(development.runtimeBaseVersion) || !['1.0.17', '1.0.18', '1.0.19'].includes(development.publicVersion)
  || !['1.0.18', '1.0.19', '1.0.20'].includes(development.developmentTargetVersion) || development.releaseCandidate) fail('M6-1 development handoff drift')
for (const [document, tokens] of [[audit, ['真实证据与预期差异', 'M6-1', '图谱有界全屏生命周期', 'F11']], [roadmap, ['M6-0', 'M6-1', '1280×800', '720×680']], [alignment, successor.status === 'accepted' ? ['M6-0 已完成', '唯一接续点为 M6-1'] : ['当前阶段：**M6-1 图谱有界全屏生命周期与真实桌面审计**', '唯一接续点为 M6-1']]]) {
  for (const token of tokens) if (!document.includes(token)) fail(`M6-0 document missing ${token}`)
}

if (failures.length) {
  console.error(`M6-0 scope selection failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M6-0 accepted: v1.0.18 selects only M6-1 graph-scoped bounded fullscreen lifecycle; cluster proxies, governance rings, structured schemas and ODP note editing remain deferred.')
