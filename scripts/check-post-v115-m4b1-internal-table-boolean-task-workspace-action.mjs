import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const policy = readJson('shared/post-v115-m4b1-internal-table-boolean-task-workspace-action-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4b1-internal-table-boolean-task-workspace-action/interaction-evidence.json')
const manifest = readJson('docs/evidence/post-v115-m4b1-internal-table-boolean-task-workspace-action/manifest.json')
const development = readJson('shared/development-version-policy.json')
const workspace = read('src-tauri/src/commands/workspace.rs')
const app = read('src-tauri/src/lib.rs')
const home = read('src/views/WorkspaceHome.vue')
const navigation = read('src/services/fileNavigation.ts')
const predecessor = readJson('shared/post-v115-m4b0-workspace-object-action-selection-policy.json')
const failures = []

if (policy.stage !== 'M4B-1' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage || policy.selectedNextStage?.id !== 'M4B-2') failures.push('M4B stage chain is invalid')
if (policy.expectations?.firstActionableBudgetMs !== 5000 || policy.expectations?.tableTaskCount !== 2) failures.push('bounded task or performance expectations drifted')
for (const field of ['workspaceGuard', 'expectedSignature', 'stableRowId', 'stableColumnId', 'strictOldValue', 'titleRecheck', 'reliableWrite', 'postWriteByteReadback', 'undoUsesNewSignature', 'undoRestoresOriginalBytes', 'preservesBomAndUntargetedBytes']) if (policy.safety?.[field] !== true) failures.push(`safety contract missing: ${field}`)
for (const token of ['MAX_WORKSPACE_TABLE_TASK_BYTES', 'table_task_completion_column', 'table_task_title_column', 'collect_table_tasks', 'patch_table_task_value', 'mutate_workspace_table_task', 'set_workspace_table_task_state']) if (!workspace.includes(token)) failures.push(`workspace Table implementation missing: ${token}`)
if (!app.includes('set_workspace_table_task_state')) failures.push('Table task command is not registered')
for (const token of ["sourceType === 'table'", "'set_workspace_table_task_state'", 'openManagedObject', "kind: 'table-row'", 'm4b1-table-task-complete', 'm4b1-table-task-restore']) if (!home.includes(token)) failures.push(`WorkspaceHome Table action missing: ${token}`)
if (!navigation.includes("kind === 'table-row'")) failures.push('shared Table row locator is missing')
if (evidence.stage !== 'M4B-1' || evidence.status !== 'passed') failures.push('real interaction evidence is invalid')
const actual = evidence.actual || {}
if (actual.initialOpenTaskCount !== 2 || actual.initialCompletedTaskCount !== 1 || actual.tableTaskCount !== 2) failures.push('real task discovery counts drifted')
if (!actual.cancelSourceUnchanged || !actual.completeChangedSource || !actual.undoRestoredOriginalBytes || !actual.restoreAndRecompleteRestoredOriginalBytes) failures.push('real completion/restore/undo byte contract failed')
if (!actual.staleSignatureRejectedWithoutWrite || actual.preciseTableRowOpenCount !== 1) failures.push('real conflict or locator contract failed')
if (actual.firstActionableMs > policy.expectations.firstActionableBudgetMs || actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved) failures.push('desktop performance or runtime gate failed')
if (!actual.responsive1280 || !actual.responsive480 || !actual.sourceFilesUnchangedAfterAudit) failures.push('desktop geometry or final source safety failed')
if (manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 5) failures.push('screenshots have not completed visual review')
if (development.currentStage !== 'M4B-2-workspace-object-action-exit-audit') failures.push('development handoff stage is not M4B-2')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) {
  console.error(`M4B-1 Table workspace task check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4B-1 accepted: internal Table boolean tasks complete, restore, undo and locate through the existing Workspace task surface.')
