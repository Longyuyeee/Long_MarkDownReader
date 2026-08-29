import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const development = readJson('shared/development-version-policy.json')
const matrix = readJson('shared/release-capability-matrix.json')
const m1 = readJson('shared/post-v115-m1-closure-policy.json')
const m1Evidence = readJson('docs/evidence/post-v115-m1-closure/runtime-evidence.json')
const m2 = readJson('shared/post-v115-m2-closure-policy.json')
const m2Large = readJson('docs/evidence/post-v115-m2-closure/large-evidence.json')
const m2States = readJson('docs/evidence/post-v115-m2-closure/state-evidence.json')
const m3a = readJson('shared/post-v115-m3a8-semantic-exploration-exit-policy.json')
const m3b = readJson('shared/post-v115-m3b12-professional-visual-system-exit-policy.json')
const m3c = readJson('shared/post-v115-m3c4-large-graph-performance-exit-audit-policy.json')
const m4a = readJson('shared/post-v115-m4a6-m1-object-location-coverage-exit-policy.json')
const m4b = readJson('shared/post-v115-m4b2-workspace-object-action-exit-audit-policy.json')
const m4c = readJson('shared/post-v115-m4c6-controlled-conversion-exit-audit-policy.json')
const m4d = readJson('shared/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit-policy.json')
const readme = read('README.md')
const draft = read('docs/RELEASE_NOTES_v1.0.16_DRAFT.md')
const capabilityView = read('src/views/ReleaseCapabilitiesView.vue')
const navigation = read('src/services/fileNavigation.ts')
const workspace = read('src/views/WorkspaceHome.vue')
const workspaceBackend = read('src-tauri/src/commands/workspace.rs')
const jsonView = read('src/views/JsonEditorView.vue')
const mediaView = read('src/views/MediaViewerView.vue')
const graphView = read('src/components/GraphView.vue')
const graphWorkspace = read('src/utils/graphWorkspace.ts')
const tableView = read('src/views/TableView.vue')
const mindmapView = read('src/views/MindMapView.vue')

const readinessCounts = Object.fromEntries(['verified', 'verified-with-limitations', 'external-dependency'].map(status => [status, matrix.formats.filter(item => item.readiness === status).length]))
const milestoneChecks = {
  m1: m1.status === 'accepted' && m1Evidence.status === 'passed' && m1Evidence.passed === true && m1Evidence.actual?.documentationDriftClosed === true,
  m2: m2.stage === 'M2-closure' && m2Large.actual?.largeFixtureFileCount === 1011 && m2Large.actual?.primaryReadyMs <= m2.expected.primaryReadyWithinMs && m2States.actual?.failureRetryRecovered === true && m2Large.actual?.runtimeErrors === 0 && m2States.actual?.runtimeErrors === 0,
  m3a: m3a.stage === 'M3A-8' && m3a.safety?.runtimeErrors === 0 && m3a.safety?.sourceFilesUnchanged === true,
  m3b: m3b.stage === 'M3B-12' && m3b.exitDecision?.m3bComplete === true && m3b.exitCriteria?.runtimeErrors === 0,
  m3c: m3c.stage === 'M3C-4' && m3c.actual?.layoutStableMs?.['5000'] <= m3c.expectations?.layoutStableMaximumMs?.['5000'] && m3c.actual?.runtimeErrors === 0 && m3c.actual?.sourceFilesUnchanged === true,
  m4a: m4a.stage === 'M4A-6' && m4a.expectations?.searchPreciseOpenCount === 7 && m4a.expectations?.graphInternalOpenCount === 7 && m4a.expectations?.runtimeErrors === 0,
  m4b: m4b.stage === 'M4B-2' && m4b.closureDecision === 'passed-bounded-action-scope' && m4b.exitGates?.runtimeErrors === 0,
  m4c: m4c.stage === 'M4C-6' && m4c.closureDecision === 'passed-bounded-conversion-scope' && m4c.workflowFamilies?.length === 4 && m4c.exitGates?.runtimeErrorsZero === true,
  m4d: m4d.stage === 'M4D-2' && m4d.closureDecision === 'passed-bounded-cleanup-scope' && Object.values(m4d.exitGates || {}).every(Boolean),
}
const sourceChecks = {
  largeJson: jsonView.includes('const JSON_RANGE_BYTES = 512 * 1024') && jsonView.includes('大文件渐进只读'),
  video: mediaView.includes('video-frame-previous') && mediaView.includes('video-capture-frame') && mediaView.includes('video-subtitle-select'),
  workspaceActions: workspace.includes("task.sourceType === 'table'") && workspaceBackend.includes('set_workspace_table_task_state') && workspaceBackend.includes('rejects_stale_signature_without_writing'),
  managedNavigation: ['workbook-sheet', 'table-row', 'opml-node'].every(token => navigation.includes(token)),
  graphSystem: graphView.includes('graph-minimap') && graphView.includes('graph-fit-selection') && graphWorkspace.includes('export const createGraphPng'),
  conversions: tableView.includes("data-testid': 'm4c1-table-conversion-disclosure'") && mindmapView.includes("data-testid': 'm4c2-opml-canvas-projection-disclosure'") && graphView.includes("data-testid': 'm4c4-graph-project-note-disclosure'") && graphView.includes("data-testid': 'm4c5-graph-canvas-disclosure'"),
}
const documentationChecks = {
  readmeDevelopmentScope: readme.includes('M1～M4D 已完成分阶段真实审计') && readme.includes('M4 跨格式工作流与有界清理已完成'),
  readmeStableBoundary: readme.includes('以下“真实界面”“核心能力”和“格式能力”描述当前 `main` 开发线') && readme.includes('公开下载仍以 v1.0.15 Release 为准'),
  readmeLimitations: ['不宣称完整 Office 等价编辑', '大 JSON 渐进只读', '不提供嵌入字幕拆封、字幕编辑或转码'].every(token => readme.includes(token)),
  draftScope: ['共享统一对象定位合同', '内部 Table 布尔任务', 'CSV/TSV→Table', 'OPML→Canvas', '图谱→项目笔记', '可重建大图导出负载'].every(token => draft.includes(token)) && draft.includes('允许进入 **M4F-0 v1.0.16 发布冻结入口审计**'),
  draftLimitations: ['不宣称完整 Excel、Word、PowerPoint 或 OpenDocument 等价编辑', '当前 `releaseCandidate=false`'].every(token => draft.includes(token)),
  capabilityPageIdentity: capabilityView.includes('DEVELOPMENT_TARGET_VERSION') && capabilityView.includes('RELEASE_MATRIX_VERSION') && capabilityView.includes('<span>能力层级</span>'),
}

const residualRisks = [
  { id: 'office-equivalence', disposition: 'non-blocking-fail-closed', boundary: 'Full Office/OpenDocument equivalence is not claimed; unsupported objects remain read-only, blocked, or reliable-copy only.' },
  { id: 'ods-odp', disposition: 'non-blocking-fail-closed', boundary: 'ODS formula/custom-style editing and ODP editing remain closed.' },
  { id: 'media-runtime', disposition: 'non-blocking-disclosed', boundary: 'Playback depends on system codecs; external-window subtitles, embedded subtitle demux, subtitle editing and transcoding remain deferred.' },
  { id: 'structured-schema', disposition: 'non-blocking-disclosed', boundary: 'YAML/XML/TOML schema providers and mappings remain deferred; no business diagnostics are invented.' },
  { id: 'graph-deferred', disposition: 'non-blocking-selected-out', boundary: 'Proxy cluster collapse, fullscreen, governance rings and performance-specific saved-view restoration are not part of the accepted graph scope.' },
  { id: 'external-evidence', disposition: 'non-blocking-fail-closed', boundary: 'ODT remains unregistered and XLSX array formula writeback remains blocked while external evidence gates are partial.' },
]
const releaseFreezeGates = [
  'freeze-product-commit',
  'atomic-runtime-package-tauri-cargo-matrix-version-transition',
  'full-ci-patch-release-quality-gate',
  'current-version-r5e-runtime-route-smoke',
  'unsigned-msi-and-nsis-build',
  'managed-windows-install-lifecycle',
  'installed-workspace-regression',
  'artifact-sha256-and-release-notes-finalization',
  'tag-and-github-release-bound-to-frozen-commit',
]
const evidence = {
  schemaVersion: 1,
  stage: 'M4E-0',
  status: 'passed',
  sourceCommit: '24526980d74115e80a93f00f177f05ab4eab28bf',
  candidateVersion: development.developmentTargetVersion,
  publicVersion: development.publicVersion,
  runtimeVersion: development.runtimeBaseVersion,
  milestoneChecks,
  sourceChecks,
  documentationChecks,
  capabilityMatrix: { appVersion: matrix.appVersion, releaseCandidate: matrix.releaseCandidate, formatCount: matrix.formats.length, profileCount: matrix.profiles.length, readinessCounts, externalGates: matrix.externalGates },
  residualRisks,
  releaseFreezeGates,
  versionDecision: 'eligible-to-enter-v1.0.16-release-freeze-not-yet-a-release-candidate',
  versionRationale: 'The cumulative development line delivers complete M1 format depth, M2 Workspace actions, M3 graph semantics/visual/performance, and M4 cross-format workflows. Suggested roadmap version rows are value thresholds, not milestone counters; the continuously declared next patch remains 1.0.16.',
  sourceUserContentIncluded: false,
  releaseCandidate: false,
}

const failures = []
for (const [name, passed] of Object.entries(milestoneChecks)) if (!passed) failures.push(`milestone closure failed: ${name}`)
for (const [name, passed] of Object.entries(sourceChecks)) if (!passed) failures.push(`actual source marker failed: ${name}`)
for (const [name, passed] of Object.entries(documentationChecks)) if (!passed) failures.push(`documentation alignment failed: ${name}`)
if (development.developmentTargetVersion !== '1.0.16' || development.publicVersion !== '1.0.15' || development.runtimeBaseVersion !== '1.0.15' || development.releaseCandidate !== false) failures.push('development version boundary drifted')
if (matrix.appVersion !== '1.0.15' || matrix.releaseCandidate !== false || matrix.formats.length !== 43 || matrix.profiles.length !== 11 || readinessCounts.verified !== 30 || readinessCounts['verified-with-limitations'] !== 7 || readinessCounts['external-dependency'] !== 6) failures.push('capability matrix facts drifted')
const externalGateState = matrix.externalGates.map(gate => `${gate.id}:${gate.status}`).sort().join(',')
if (externalGateState !== 'e1b-wps-odt:partial,x3-b6-array-producers:partial' || residualRisks.some(risk => !risk.disposition.startsWith('non-blocking'))) failures.push('residual risk disposition drifted')
if (failures.length) throw new Error(`M4E-0 capability and version decision audit failed: ${failures.join(', ')}`)

const output = 'docs/evidence/post-v115-m4e0-capability-facts-residual-risks-and-version-decision-audit'
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(`${output}/decision.json`, `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`M4E-0 decision passed: ${Object.keys(milestoneChecks).length} milestone closures and ${Object.keys(sourceChecks).length} source families align; ${residualRisks.length} bounded risks remain; ${releaseFreezeGates.length} release-freeze gates are still pending.`)
