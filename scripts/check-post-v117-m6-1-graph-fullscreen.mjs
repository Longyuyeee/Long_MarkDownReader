import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const text = file => fs.readFileSync(file, 'utf8')
const byteVariants = file => {
  const raw = fs.readFileSync(file)
  if (!/\.(?:json|vue)$/i.test(file)) return [raw]
  const lf = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'))
  const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'))
  return [raw, lf, crlf]
}
const matchesSha256 = (file, sha256) => byteVariants(file).some(bytes => crypto.createHash('sha256').update(bytes).digest('hex') === sha256)
const matchesIdentity = (file, sizeBytes, sha256) => byteVariants(file).some(bytes => bytes.length === sizeBytes && crypto.createHash('sha256').update(bytes).digest('hex') === sha256)
const policy = json('shared/post-v117-m6-1-graph-fullscreen-policy.json')
const predecessor = json('shared/post-v117-m6-0-v1018-scope-selection-policy.json')
const successor = json('shared/post-v117-m6-2-v1018-next-slice-selection-policy.json')
const development = json('shared/development-version-policy.json')
const manifest = json('docs/evidence/post-v117-m6-1-graph-fullscreen/manifest.json')
const graph = text('src/components/GraphView.vue')
const app = text('src/App.vue')
const audit = text('docs/Post_v1.0.17_M6_1_Knowledge_Graph_Bounded_Fullscreen_Lifecycle_Audit_2026-08-31.md')
const roadmap = text('docs/Post_v1.0.17_v1.0.18_Professional_Capability_Roadmap_2026-08-31.md')
const failures = []
const fail = message => failures.push(message)
const laterGraphDevelopmentActive = /^M[78]-[0-9]+-/.test(development.currentStage)

if (policy.schemaVersion !== 1 || policy.stage !== 'M6-1' || policy.status !== 'accepted' || policy.predecessor !== predecessor.stage
  || predecessor.selectedNextStage?.id !== policy.stage || predecessor.selectedNextStage?.name !== policy.name) fail('M6-1 identity/predecessor drift')
if (policy.runtimeBaseVersion !== '1.0.17' || policy.publicVersion !== '1.0.17' || policy.developmentTargetVersion !== '1.0.18'
  || policy.releaseCandidate || policy.binaryVersionChange || policy.sourceUserContentIncluded) fail('M6-1 version/privacy boundary drift')
if (!laterGraphDevelopmentActive && !matchesSha256('src/components/GraphView.vue', policy.implementation?.surfaceSha256)) fail('M6-1 production surface hash drift')
for (const token of ['data-testid="graph-fullscreen"', ':aria-pressed="graphFullscreenActive"', ':aria-label="graphFullscreenActive', 'document.addEventListener(\'fullscreenchange\'', 'container.requestFullscreen()', 'document.exitFullscreen()', '.catch(() => {})', '.graph-container:fullscreen', 'ResizeObserver']) {
  if (!graph.includes(token)) fail(`M6-1 implementation missing ${token}`)
}
for (const absent of ['data-testid="graph-cluster-collapse"', 'data-testid="graph-node-governance-ring"']) if (graph.includes(absent)) fail(`M6-1 semantic boundary drift: ${absent}`)
if (!app.includes("if (e.key === 'F11') { e.preventDefault(); store.toggleZen() }")) fail('F11 zen-mode boundary drift')

if (policy.realDesktopAudit?.sessions !== 2 || policy.realDesktopAudit?.fullscreenCycles !== 6 || policy.realDesktopAudit?.successfulEntries !== 6
  || policy.realDesktopAudit?.successfulEscapeExits !== 6 || policy.realDesktopAudit?.successfulRouteUnmountExits !== 2
  || policy.realDesktopAudit?.runtimeErrors !== 0 || !policy.realDesktopAudit?.sourceFilesUnchanged || policy.realDesktopAudit?.screenshotsVisuallyReviewed !== 6
  || policy.differencesAndCorrections?.length !== 3) fail('M6-1 real desktop summary drift')
if (manifest.stage !== 'M6-1' || manifest.status !== 'accepted' || manifest.files?.length !== 8 || !manifest.screenshotsVisuallyReviewed || manifest.sourceUserContentIncluded) fail('M6-1 manifest drift')
for (const item of manifest.files ?? []) {
  const file = path.join('docs/evidence/post-v117-m6-1-graph-fullscreen', item.file)
  if (!fs.existsSync(file) || !matchesIdentity(file, item.sizeBytes, item.sha256)) fail(`M6-1 evidence identity drift: ${item.file}`)
}
for (const [file, theme, motion] of [['desktop-dark-reduced.json', 'dark', 'reduced'], ['desktop-white-calm.json', 'white', 'calm']]) {
  const evidence = json(path.join('docs/evidence/post-v117-m6-1-graph-fullscreen', file))
  const cycles = evidence.actual?.cycles ?? []
  if (evidence.stage !== 'M6-1' || evidence.session?.theme !== theme || evidence.session?.motion !== motion || cycles.length !== 3
    || evidence.actual?.runtimeErrors !== 0 || !evidence.actual?.sourceFilesUnchanged || evidence.actual?.beforeSha256 !== evidence.actual?.afterSha256
    || !evidence.actual?.routeCleanup?.returnedToLibrary || !evidence.actual?.routeCleanup?.fullscreenElementCleared) fail(`M6-1 session boundary drift: ${file}`)
  for (const cycle of cycles) {
    const { before, inside, after, viewport } = cycle
    if (!before.documentFits || before.fullscreenElementIsGraph || before.fullscreenActive !== 'false' || before.buttonLabel !== '图谱全屏'
      || !inside.documentFits || !inside.fullscreenElementIsGraph || inside.fullscreenActive !== 'true' || inside.buttonLabel !== '退出图谱全屏'
      || inside.containerRect?.top !== 0 || inside.containerRect?.width !== viewport.width || inside.containerRect?.height !== viewport.height
      || after.fullscreenElementIsGraph || after.fullscreenActive !== 'false' || after.buttonLabel !== '图谱全屏'
      || before.selectedCount !== inside.selectedCount || inside.selectedCount !== after.selectedCount
      || before.cameraPose !== inside.cameraPose || inside.cameraPose !== after.cameraPose
      || !inside.minimapVisible || !inside.historyVisible || !after.minimapVisible || !after.historyVisible) fail(`M6-1 cycle drift: ${file}/${viewport.width}x${viewport.height}`)
  }
}
const developmentStageAccepted = successor.status === 'scope-selected' ? (/^M6-(?:[3-9]|[1-9][0-9]+)-/.test(development.currentStage) || /^M[78]-[0-9]+-/.test(development.currentStage)) : development.currentStage === 'M6-2-v1.0.18-next-slice-selection-audit'
if (!developmentStageAccepted || !['1.0.17', '1.0.18', '1.0.19', '1.0.20', '1.0.21'].includes(development.runtimeBaseVersion)
  || !['1.0.17', '1.0.18', '1.0.19', '1.0.20', '1.0.21'].includes(development.publicVersion) || !['1.0.18', '1.0.19', '1.0.20', '1.0.21', '1.0.22'].includes(development.developmentTargetVersion) || development.releaseCandidate) fail('M6-2 handoff drift')
for (const [document, tokens] of [[audit, ['6/6', 'Document not active', 'aria-label', 'M6-2']], [roadmap, ['M6-1 退出回执', '暗色/reduced', '浅色/calm', 'M6-2']]]) {
  for (const token of tokens) if (!document.includes(token)) fail(`M6-1 document missing ${token}`)
}

if (failures.length) {
  console.error(`M6-1 graph fullscreen failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M6-1 accepted: 6/6 real Tauri fullscreen cycles preserve graph state, Escape and route cleanup exit safely, runtime errors remain zero and source files remain unchanged.')
