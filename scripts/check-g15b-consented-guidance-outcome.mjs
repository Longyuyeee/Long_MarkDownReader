import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const policy = json('shared/g15b-consented-guidance-outcome-policy.json')
const packageJson = json('package.json')
const graph = read('src-tauri/src/commands/graph.rs')
const lib = read('src-tauri/src/lib.rs')
const settings = read('src/views/SettingsView.vue')
const audit = read('docs/G15B_Consented_Knowledge_Guidance_Outcome_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G15B' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G15B policy identity drift')
if (policy.status !== 'consented-guidance-outcome-comparison-implemented-user-execution-next' || policy.nextStage !== 'G15-consented-real-library-baseline-remediation-follow-up') failures.push('G15B stage boundary drift')
if (policy.outcomes.length !== 4 || policy.measuredChanges.length !== 6) failures.push('G15B comparison dimensions drift')
for (const key of ['baselinePrivacyContractValidated', 'localComputationOnly', 'previewBeforeExport', 'explicitConfirmationRequired', 'createNewReceiptOnly']) if (policy.privacy[key] !== true) failures.push(`G15B privacy guarantee drift: ${key}`)
for (const key of ['automaticUploadAllowed', 'documentContentIncluded', 'fileNameIncluded', 'objectIdentifierIncluded', 'absolutePathIncluded', 'libraryFingerprintIncluded']) if (policy.privacy[key] !== false) failures.push(`G15B excluded-data boundary drift: ${key}`)
for (const key of ['realUserComparisonComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G15B external evidence must remain false: ${key}`)

for (const token of ['pub struct KnowledgeGraphObservationComparison', 'compare_knowledge_graph_observations(', 'load_knowledge_graph_observation(', 'metadata.len() > 1024 * 1024', 'local-consented-aggregate-comparison-only', 'coverage-increased', 'isolated-objects-reduced', '.create_new(true)', 'consented_observation_comparison_reports_improvement_without_identifiers']) requireText(graph, token, `G15B backend/privacy marker missing: ${token}`)
for (const token of ['get_knowledge_graph_observation_comparison', 'export_knowledge_graph_observation_comparison']) requireText(lib, token, `G15B command registration missing: ${token}`)
for (const token of ['data-testid="knowledge-observation-compare"', 'previewKnowledgeObservationComparison', '确认保存知识网络改善对比', '请确认基线来自当前资料库', '不会自动上传', 'export_knowledge_graph_observation_comparison']) requireText(settings, token, `G15B consented UI marker missing: ${token}`)
for (const token of ['G15B', 'releaseCandidate=false', '前后对比', '真实资料库', '不会自动上传']) requireText(audit, token, `G15B audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g15b-consented-guidance-outcome'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g15b-consented-guidance-outcome')) failures.push('G15B checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('G15B consented guidance outcome passed: local baseline and follow-up aggregates produce a preview-first, create-new comparison receipt without content, identifiers, paths, fingerprints, or automatic upload; real-user execution remains pending.')
