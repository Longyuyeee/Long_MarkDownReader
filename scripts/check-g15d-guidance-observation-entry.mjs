import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const policy = json('shared/g15d-guidance-observation-entry-policy.json')
const packageJson = json('package.json')
const home = read('src/views/WorkspaceHome.vue')
const graph = read('src/components/GraphView.vue')
const settings = read('src/views/SettingsView.vue')
const audit = read('docs/G15D_Knowledge_Guidance_Observation_Entry_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G15D' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G15D policy identity drift')
if (policy.status !== 'guidance-observation-entry-implemented-installed-navigation-next' || policy.nextStage !== 'G15D-installed-current-window-observation-entry-acceptance') failures.push('G15D stage boundary drift')
if (policy.entries.workspaceHome !== 'settings-knowledge-observation-focus' || policy.entries.graphRemediation !== 'settings-knowledge-observation-focus') failures.push('G15D entry matrix drift')
for (const key of ['sameApplicationWindow', 'targetScrollIntoView', 'targetHighlight']) if (policy.destination[key] !== true) failures.push(`G15D navigation guarantee drift: ${key}`)
for (const [key, value] of Object.entries(policy.consentBoundary)) if (value !== false) failures.push(`G15D consent boundary must remain false: ${key}`)
for (const key of ['workspaceEntryImplemented', 'graphFollowUpEntryImplemented', 'settingsFocusImplemented', 'frontendProductionBuildComplete']) if (policy.qualityGate[key] !== true) failures.push(`G15D implemented gate drift: ${key}`)
for (const key of ['installedNavigationComplete', 'realUserComparisonComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G15D external gate must remain false: ${key}`)

for (const token of ['data-testid="knowledge-observation-entry"', '记录治理基线', 'openKnowledgeObservation', "name: 'Settings', query: { focus: 'knowledge-observation' }"]) requireText(home, token, `G15D workspace entry missing: ${token}`)
for (const token of ['data-testid="knowledge-outcome-entry"', '复查改善', 'openKnowledgeOutcome', "name: 'Settings', query: { focus: 'knowledge-observation' }"]) requireText(graph, token, `G15D graph follow-up entry missing: ${token}`)
for (const token of ['ref="knowledgeObservationRow"', "route.query.focus === 'knowledge-observation'", "scrollIntoView({ behavior: 'smooth', block: 'center' })", 'is-route-focused']) requireText(settings, token, `G15D focused Settings destination missing: ${token}`)
for (const token of ['G15D', 'releaseCandidate=false', '记录治理基线', '复查改善', '不会自动']) requireText(audit, token, `G15D audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g15d-guidance-observation-entry'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g15d-guidance-observation-entry')) failures.push('G15D checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('G15D guidance observation entry passed: Workspace and graph remediation now reach the focused consented outcome workflow in the current window without bypassing preview, file choice, or confirmation.')
