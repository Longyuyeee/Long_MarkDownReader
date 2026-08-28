import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const policy = readJson('shared/post-v115-m4b0-workspace-object-action-selection-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4b0-workspace-object-action-selection/selection-evidence.json')
const manifest = readJson('docs/evidence/post-v115-m4b0-workspace-object-action-selection/manifest.json')
const development = readJson('shared/development-version-policy.json')
const successor = readJson('shared/post-v115-m4b1-internal-table-boolean-task-workspace-action-policy.json')
const closure = readJson('shared/post-v115-m4b2-workspace-object-action-exit-audit-policy.json')
const workspaceHome = read('src/views/WorkspaceHome.vue')
const workspaceBackend = read('src-tauri/src/commands/workspace.rs')
const tableBackend = read('src-tauri/src/commands/table.rs')
const navigation = read('src/services/fileNavigation.ts')
const failures = []

if (policy.stage !== 'M4B-0' || policy.predecessor !== 'M4A-6' || policy.selectedNextStage?.id !== 'M4B-1') failures.push('selection stage chain is invalid')
if (policy.candidates?.length !== 7 || policy.candidates.filter(item => item.selection === 'selected').map(item => item.format).join(',') !== 'Table') failures.push('the seven-format candidate matrix or selected format drifted')
const selected = policy.candidates.find(item => item.selection === 'selected')
for (const field of ['semanticBoundary', 'writeBoundary', 'conflictBoundary', 'undoBoundary', 'navigationBoundary']) if (!selected?.[field]) failures.push(`selected Table boundary missing: ${field}`)
if (!policy.selectedNextStage?.excluded?.includes('CSV and TSV task inference') || !policy.selectedNextStage?.excluded?.includes('Version transition or release candidate')) failures.push('M4B-1 exclusions are incomplete')
if (!workspaceHome.includes("'set_workspace_markdown_task_state'") || !workspaceBackend.includes('mutate_workspace_task')) failures.push('existing Markdown task action fact is missing')
if (!workspaceHome.includes('openAnnotation') || !workspaceHome.includes('WorkspaceHealthQueue')) failures.push('existing PDF annotation action fact is missing')
if (!tableBackend.includes('expected_signature') || !tableBackend.includes('write_internal_table')) failures.push('selected Table signature/reliable-write foundation is missing')
if (!navigation.includes("kind === 'table-row'") || !navigation.includes("{ row: objectId }")) failures.push('shared Table row locator contract is missing')
if (evidence.stage !== 'M4B-0' || evidence.status !== 'passed') failures.push('selection evidence status is invalid')
if (evidence.actual?.workspace?.markdownTaskCount !== 1 || evidence.actual?.workspace?.tableTaskCount !== 0) failures.push('pre-implementation Workspace task gap is not preserved')
if (evidence.actual?.table?.booleanTaskCandidateCount !== 2 || evidence.actual?.table?.stableRowIds?.length !== 2 || !evidence.actual?.table?.rowLocatorObserved) failures.push('real Table candidate or locator evidence is incomplete')
if (!evidence.actual?.sourceFilesUnchanged || evidence.actual?.runtimeErrorCount !== 0 || evidence.actual?.blockingErrorSurfaceObserved) failures.push('desktop source-safety or runtime gate failed')
if (manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 3) failures.push('desktop screenshots have not completed visual review')
if (successor.predecessor !== policy.stage || policy.selectedNextStage?.id !== successor.stage || successor.selectedNextStage?.id !== closure.stage || closure.predecessor !== successor.stage) failures.push('implemented successor chain is invalid')
if (development.currentStage !== 'M4C-0-controlled-conversion-workflow-selection-audit') failures.push('development handoff stage is not M4C-0')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) {
  console.error(`M4B-0 workspace object action selection check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4B-0 selection accepted: Table boolean task rows are the only approved M4B-1 Workspace action batch.')
