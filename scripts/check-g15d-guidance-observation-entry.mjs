import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const policy = json('shared/g15d-guidance-observation-entry-policy.json')
const packageJson = json('package.json')
const home = read('src/views/WorkspaceHome.vue')
const graph = read('src/components/GraphView.vue')
const settings = read('src/views/SettingsView.vue')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const workflow = read('.github/workflows/u2-unsigned-lifecycle.yml')
const audit = read('docs/G15D_Knowledge_Guidance_Observation_Entry_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G15D' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G15D policy identity drift')
if (policy.status !== 'installed-observation-entry-runner-integrated-hosted-execution-next' || policy.nextStage !== 'G15D-hosted-installed-current-window-observation-entry-acceptance') failures.push('G15D stage boundary drift')
if (!/^[a-f0-9]{40}$/.test(policy.productSourceCommit) || policy.hostedRunId !== null || policy.expectedEvidenceFiles.length !== 3) failures.push('G15D pending installed evidence identity drift')
if (policy.entries.workspaceHome !== 'settings-knowledge-observation-focus' || policy.entries.graphRemediation !== 'settings-knowledge-observation-focus') failures.push('G15D entry matrix drift')
for (const key of ['sameApplicationWindow', 'targetScrollIntoView', 'targetHighlight']) if (policy.destination[key] !== true) failures.push(`G15D navigation guarantee drift: ${key}`)
for (const [key, value] of Object.entries(policy.consentBoundary)) if (value !== false) failures.push(`G15D consent boundary must remain false: ${key}`)
for (const key of ['workspaceEntryImplemented', 'graphFollowUpEntryImplemented', 'settingsFocusImplemented', 'frontendProductionBuildComplete']) if (policy.qualityGate[key] !== true) failures.push(`G15D implemented gate drift: ${key}`)
for (const key of ['installedNavigationComplete', 'realUserComparisonComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G15D external gate must remain false: ${key}`)

for (const token of ['data-testid="knowledge-observation-entry"', '记录治理基线', 'openKnowledgeObservation', "name: 'Settings', query: { focus: 'knowledge-observation' }"]) requireText(home, token, `G15D workspace entry missing: ${token}`)
for (const token of ['data-testid="knowledge-outcome-entry"', '复查改善', 'openKnowledgeOutcome', "name: 'Settings', query: { focus: 'knowledge-observation' }"]) requireText(graph, token, `G15D graph follow-up entry missing: ${token}`)
for (const token of ['ref="knowledgeObservationRow"', "route.query.focus === 'knowledge-observation'", "scrollIntoView({ behavior: 'smooth', block: 'center' })", 'is-route-focused']) requireText(settings, token, `G15D focused Settings destination missing: ${token}`)
for (const token of ['workspace knowledge observation entry', 'workspaceObservationNavigation', 'graph knowledge outcome entry', 'graphOutcomeNavigation', "exportTriggered: false", "id: 'installed-knowledge-observation-entry-navigation'", ...policy.expectedEvidenceFiles]) requireText(capture, token, `G15D installed navigation runner missing: ${token}`)
for (const token of ['workflow_dispatch:', 'product_ref:', 'capture-r5j-installed-artifact-smoke.mjs', 'actions/upload-artifact']) requireText(workflow, token, `G15D hosted workflow marker missing: ${token}`)
for (const token of ['G15D', 'releaseCandidate=false', '记录治理基线', '复查改善', '不会自动']) requireText(audit, token, `G15D audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g15d-guidance-observation-entry'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g15d-guidance-observation-entry')) failures.push('G15D checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('G15D guidance observation entry passed: source routing and the installed current-window navigation runner cover Workspace and graph follow-up entries without triggering export; hosted execution remains pending.')
