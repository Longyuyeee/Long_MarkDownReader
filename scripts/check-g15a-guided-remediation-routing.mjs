import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/g15a-guided-remediation-routing-policy.json')
const packageJson = json('package.json')
const graphPanel = read('src/components/GraphHealthPanel.vue')
const graph = read('src/components/GraphView.vue')
const audit = read('docs/G15A_Guided_Knowledge_Remediation_Routing_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G15A' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G15A policy identity drift')
if (policy.status !== 'guided-remediation-routing-implemented-real-user-execution-next' || policy.nextStage !== 'G15-consented-real-library-guidance-observation') failures.push('G15A stage boundary drift')
if (Object.keys(policy.routes).length !== 6 || new Set(Object.values(policy.routes)).size !== 5) failures.push('G15A guidance route matrix drift')
for (const key of ['sameApplicationWindow', 'routeQueryBounded', 'orphanFocusEphemeral']) if (policy.interactionBoundary[key] !== true) failures.push(`G15A interaction guarantee drift: ${key}`)
for (const key of ['savedGraphFiltersMutated', 'userContentMutated']) if (policy.interactionBoundary[key] !== false) failures.push(`G15A mutation boundary drift: ${key}`)
for (const key of ['sourceRoutingContractComplete', 'frontendProductionBuildComplete']) if (policy.qualityGate[key] !== true) failures.push(`G15A implemented gate must remain true: ${key}`)
for (const key of ['realUserExecutionComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G15A external gate must remain false: ${key}`)

for (const token of ['applyGuidance(pulse.guidance[0])', "'add-first-knowledge-object': 'library'", "'create-first-relation': 'relations'", "'increase-relation-coverage': 'orphans'", "'connect-isolated-objects': 'orphans'", "'diversify-relation-types': 'diversity'", "'network-health-on-track': 'overview'"]) requireText(graphPanel, token, `G15A graph governance route marker missing: ${token}`)
for (const token of ["focus === 'library'", "router.push({ name: 'LibraryMode' })", "router.replace({ name: 'Graph', query })"]) requireText(graph, token, `G15A graph route marker missing: ${token}`)
for (const token of ['data-testid="graph-remediation-focus"', ':data-remediation-focus="remediationFocus"', "['relations', 'orphans', 'diversity', 'overview']", "remediationFocus.value !== 'orphans'", '正在聚焦孤立对象', '打开链接教程', '打开治理列表', 'delete query.focus', "router.replace({ name: 'Graph', query })"]) requireText(graph, token, `G15A graph remediation marker missing: ${token}`)
for (const token of ['G15A', 'releaseCandidate=false', '孤立对象', '临时', '真实资料库']) requireText(audit, token, `G15A audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g15a-guided-remediation-routing'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g15a-guided-remediation-routing')) failures.push('G15A checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('G15A guided remediation routing passed: each knowledge recommendation opens a bounded management context without mutating content or persisted graph filters; real-user execution remains pending.')
