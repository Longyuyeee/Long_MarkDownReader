import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m2-closure-policy.json', 'utf8'))
const root = 'docs/evidence/post-v115-m2-closure'
const large = JSON.parse(fs.readFileSync(`${root}/large-evidence.json`, 'utf8'))
const states = JSON.parse(fs.readFileSync(`${root}/state-evidence.json`, 'utf8'))
const home = fs.readFileSync('src/views/WorkspaceHome.vue', 'utf8')
const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const failures = []

for (const marker of ['m2-closure-create', 'm2-closure-open', 'm2-closure-loading', 'm2-closure-empty', 'openTask', 'taskLine']) if (!home.includes(marker)) failures.push(`Workspace closure marker missing: ${marker}`)
for (const marker of ['revealWorkspaceTask', 'workspace-task-locator-target', 'data-workspace-task-line']) if (!library.includes(marker)) failures.push(`Task locator marker missing: ${marker}`)
const actual = { ...large.actual, ...states.actual, runtimeErrors: large.actual.runtimeErrors + states.actual.runtimeErrors }
for (const key of ['largeFixtureFileCount', 'loadingStateObserved', 'keyboardCreateMenu', 'markdownCreatedAndOpened', 'createdFileCleanupByteExact', 'keyboardOpenLibrary', 'taskLineLocated', 'emptyStateVisible', 'failureStateVisible', 'failureRetryRecovered', 'responsive720', 'responsive480', 'runtimeErrors']) {
  if (actual[key] !== policy.expected[key]) failures.push(`Actual ${key}=${JSON.stringify(actual[key])}, expected ${JSON.stringify(policy.expected[key])}`)
}
if (!(large.actual.primaryReadyMs <= policy.expected.primaryReadyWithinMs)) failures.push(`Large workspace ready ${large.actual.primaryReadyMs}ms exceeds ${policy.expected.primaryReadyWithinMs}ms budget`)
if (large.actual.beforeSha256 !== large.actual.afterCleanupSha256) failures.push('Large real fixture was not byte-restored after create cleanup')
for (const evidence of [large, states]) for (const file of evidence.evidenceFiles || []) if (!fs.existsSync(`${root}/${file}`)) failures.push(`Evidence missing: ${file}`)
if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log(`M2 closure accepted: real quick create/open, line-level task location, explicit states and ${actual.largeFixtureFileCount}-file workspace ready in ${large.actual.primaryReadyMs}ms.`)
