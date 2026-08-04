import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/g12-consented-knowledge-observation-policy.json')
const packageJson = json('package.json')
const graph = read('src-tauri/src/commands/graph.rs')
const lib = read('src-tauri/src/lib.rs')
const settings = read('src/views/SettingsView.vue')
const audit = read('docs/G12_Consented_Knowledge_Observation_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G12' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G12 policy identity drift')
if (policy.status !== 'consented-aggregate-observation-export-implemented-user-execution-next' || policy.nextStage !== 'G12-consented-user-execution-and-analysis') failures.push('G12 stage boundary drift')
for (const [key, expected] of Object.entries({ previewBeforeExport: true, explicitConfirmationRequired: true, userChoosesLocalDestination: true, automaticUploadAllowed: false })) if (policy.consent[key] !== expected) failures.push(`G12 consent boundary drift: ${key}`)
if (policy.includedAggregates.length !== 8 || new Set(policy.includedAggregates).size !== 8 || policy.excludedData.length !== 8 || new Set(policy.excludedData).size !== 8) failures.push('G12 aggregate/privacy matrix drift')
for (const key of ['aggregateBuilderImplemented', 'privacyRegressionImplemented', 'settingsPreviewAndExplicitExportImplemented']) if (policy.qualityGate[key] !== true) failures.push(`G12 implemented gate must remain true: ${key}`)
for (const key of ['realUserObservationComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G12 external gate must remain false: ${key}`)

for (const token of ['pub struct KnowledgeGraphObservation', 'get_knowledge_graph_observation', 'export_knowledge_graph_observation', '.create_new(true)', '知识网络观察回执必须保存为 .json 文件', 'consented_observation_contains_only_aggregate_graph_metrics', 'observation leaked']) requireText(graph, token, `G12 backend/privacy marker missing: ${token}`)
for (const token of ['get_knowledge_graph_observation', 'export_knowledge_graph_observation']) requireText(lib, token, `G12 command registration missing: ${token}`)
for (const token of ['data-testid="knowledge-observation-export"', 'previewKnowledgeObservation', '确认记录当前关系状态', '确认并选择保存位置', '不会自动上传', "save({", "export_knowledge_graph_observation"]) requireText(settings, token, `G12 explicit consent UI marker missing: ${token}`)
for (const token of ['G12', 'releaseCandidate=false', '不包含正文', '用户明确确认', '真实资料库']) requireText(audit, token, `G12 audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g12-consented-knowledge-observation'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g12-consented-knowledge-observation')) failures.push('G12 checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('G12 consented knowledge observation passed: preview-first local export contains aggregate graph metrics only, requires explicit confirmation, and performs no automatic upload; real-user execution remains pending.')
