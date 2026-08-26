import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m2a1-workspace-task-policy.json', 'utf8'))
const evidence = JSON.parse(fs.readFileSync('docs/evidence/post-v115-m2a1-workspace-task/desktop-evidence.json', 'utf8'))
const view = fs.readFileSync('src/views/WorkspaceHome.vue', 'utf8')
const command = fs.readFileSync('src-tauri/src/commands/workspace.rs', 'utf8')
const lib = fs.readFileSync('src-tauri/src/lib.rs', 'utf8')
const failures = []

for (const marker of ['m2a1-task-complete', 'm2a1-task-undo', 'confirmAppAction', 'set_workspace_markdown_task_state']) {
  if (!view.includes(marker)) failures.push(`Workspace task frontend marker missing: ${marker}`)
}
for (const marker of ['mutate_workspace_task', 'verify_current_signature', 'write_bytes', 'resolve_existing_file', 'task_mutation_completes_and_undoes_without_changing_text_format', 'task_mutation_rejects_stale_signature_and_changed_line']) {
  if (!command.includes(marker)) failures.push(`Workspace task backend marker missing: ${marker}`)
}
if (!lib.includes('set_workspace_markdown_task_state')) failures.push('Workspace task command is not registered')
if (view.includes('class="metric-strip"')) failures.push('Legacy format metric strip remains on the action-oriented workspace')
if (evidence.stage !== policy.stage) failures.push('Evidence stage does not match policy')
if (evidence.actual.beforeSha256 !== evidence.actual.afterUndoSha256) failures.push('Desktop undo did not restore original bytes')
if (evidence.actual.beforeSha256 === evidence.actual.completedSha256) failures.push('Desktop completion did not change the source')
for (const key of ['confirmationObserved', 'cancelSourceUnchanged', 'undoRestoredOriginalBytes', 'utf8BomPreserved', 'crlfPreserved', 'responsive760']) {
  if (evidence.actual[key] !== true) failures.push(`Desktop actual failed: ${key}`)
}
if (evidence.actual.runtimeErrors !== policy.expected.runtimeErrors) failures.push('Desktop runtime errors are not zero')
for (const file of evidence.evidenceFiles || []) {
  if (!fs.existsSync(`docs/evidence/post-v115-m2a1-workspace-task/${file}`)) failures.push(`Evidence image missing: ${file}`)
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('M2A1 accepted: a real Markdown task can be confirmed, written with signature protection, and byte-restored from the workspace.')
