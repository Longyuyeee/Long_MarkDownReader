import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/g13-actionable-knowledge-guidance-policy.json')
const packageJson = json('package.json')
const graph = read('src-tauri/src/commands/graph.rs')
const home = read('src/views/WorkspaceHome.vue')
const settings = read('src/views/SettingsView.vue')
const audit = read('docs/G13_Actionable_Knowledge_Guidance_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G13' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G13 policy identity drift')
if (policy.status !== 'actionable-local-guidance-implemented-real-user-execution-next' || policy.nextStage !== 'G13-consented-real-library-execution') failures.push('G13 stage boundary drift')
if (policy.guidanceCodes.length !== 6 || new Set(policy.guidanceCodes).size !== 6 || policy.inputs.length !== 5) failures.push('G13 guidance matrix drift')
for (const key of ['localComputationOnly']) if (policy.privacy[key] !== true) failures.push(`G13 privacy gate must remain true: ${key}`)
for (const key of ['documentContentUsed', 'fileNameUsed', 'objectIdentifierUsed', 'absolutePathUsed', 'automaticUploadAllowed']) if (policy.privacy[key] !== false) failures.push(`G13 privacy boundary drift: ${key}`)
for (const key of ['workspaceHome', 'consentedObservationPreview', 'aggregateReceipt']) if (policy.surfaces[key] !== true) failures.push(`G13 surface missing: ${key}`)
for (const key of ['deterministicThresholdTestsComplete', 'privacyRegressionExtended']) if (policy.qualityGate[key] !== true) failures.push(`G13 implemented gate must remain true: ${key}`)
for (const key of ['realUserExecutionComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G13 external gate must remain false: ${key}`)

for (const token of ['pub struct KnowledgeGraphGuidance', 'knowledge_graph_guidance(', 'add-first-knowledge-object', 'increase-relation-coverage', 'network-health-on-track', 'knowledge_graph_guidance_covers_empty_disconnected_and_healthy_networks']) requireText(graph, token, `G13 backend marker missing: ${token}`)
for (const token of ['data-testid="knowledge-network-guidance"', 'data-guidance-code', 'guidanceCopy', '处理 ${item.currentValue} 个孤立对象']) requireText(home, token, `G13 workspace guidance marker missing: ${token}`)
for (const token of ['observationGuidanceLabel', '改善建议：${preview.guidance', 'guidance: { code: string']) requireText(settings, token, `G13 observation guidance marker missing: ${token}`)
for (const token of ['G13', '完全本地', '不读取正文', '真实资料库', 'releaseCandidate=false']) requireText(audit, token, `G13 audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g13-actionable-knowledge-guidance'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g13-actionable-knowledge-guidance')) failures.push('G13 checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('G13 actionable knowledge guidance passed: deterministic aggregate-only recommendations appear in Workspace Home and consented observation without claiming real-user or signed-client evidence.')
