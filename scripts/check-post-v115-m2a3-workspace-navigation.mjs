import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m2a3-workspace-navigation-policy.json', 'utf8'))
const evidenceRoot = 'docs/evidence/post-v115-m2a3-workspace-navigation'
const evidence = JSON.parse(fs.readFileSync(`${evidenceRoot}/desktop-evidence.json`, 'utf8'))
const home = fs.readFileSync('src/views/WorkspaceHome.vue', 'utf8')
const backend = fs.readFileSync('src-tauri/src/commands/workspace.rs', 'utf8')
const failures = []

for (const marker of ['m2a3-continue-work', 'continueGroups', 'm2a3-task-filters', 'm2a3-task-results', 'm2a3-task-restore', 'taskDisplayText']) {
  if (!home.includes(marker)) failures.push(`Workspace M2A3 marker missing: ${marker}`)
}
if (/<h2>常用画布<\/h2>/.test(home)) failures.push('Standalone common Canvas section still exists')
for (const marker of ['completed_tasks', 'task_priority', 'task_due_date', 'MAX_COMPLETED_TASKS']) {
  if (!backend.includes(marker)) failures.push(`Workspace backend marker missing: ${marker}`)
}
if (evidence.stage !== policy.stage) failures.push('Evidence stage mismatch')
for (const [key, expected] of Object.entries(policy.expected)) {
  if (evidence.actual[key] !== expected) failures.push(`Actual ${key}=${JSON.stringify(evidence.actual[key])}, expected ${JSON.stringify(expected)}`)
}
if (evidence.actual.beforeSha256 !== evidence.actual.afterRestoreSha256) failures.push('Task restore did not return fixture to byte-exact state')
for (const file of evidence.evidenceFiles || []) {
  if (!fs.existsSync(`${evidenceRoot}/${file}`)) failures.push(`Evidence missing: ${file}`)
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('M2A3 accepted: continue-work entries are globally deduplicated, task filters use real metadata, completion/restore persists byte-exactly, and the workspace is responsive.')
