import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const policy = json('shared/g15f-local-comparison-receipt-review-policy.json')
const packageJson = json('package.json')
const graph = read('src-tauri/src/commands/graph.rs')
const lib = read('src-tauri/src/lib.rs')
const settings = read('src/views/SettingsView.vue')
const capture = read('scripts/capture-r5j-installed-artifact-smoke.mjs')
const audit = read('docs/G15F_Local_Comparison_Receipt_Review_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G15F' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G15F policy identity drift')
if (policy.status !== 'installed-local-receipt-review-runner-integrated-hosted-execution-next' || policy.nextStage !== 'G15F-hosted-installed-local-receipt-review-execution') failures.push('G15F stage boundary drift')
if (policy.inputBoundary.extension !== 'json' || policy.inputBoundary.maximumBytes !== 1048576) failures.push('G15F bounded input drift')
for (const key of ['userSelectsFile', 'unknownFieldsRejected', 'privacyFlagsRequiredFalse', 'aggregateConsistencyValidated']) if (policy.inputBoundary[key] !== true) failures.push(`G15F validation boundary drift: ${key}`)
for (const key of ['receiptPathPersisted', 'automaticUploadAllowed']) if (policy.inputBoundary[key] !== false) failures.push(`G15F privacy boundary drift: ${key}`)
for (const key of ['syntheticReceiptOnly', 'formalInstalledBackendCommandUsed', 'visibleSettingsEntryRequired', 'sameWindowRequired', 'unknownFieldRejectionRequired']) if (policy.installedAcceptance[key] !== true) failures.push(`G15F installed acceptance boundary drift: ${key}`)
for (const key of ['pathRenderedAllowed', 'pathPersistedAllowed']) if (policy.installedAcceptance[key] !== false) failures.push(`G15F installed privacy boundary drift: ${key}`)
for (const key of ['strictBackendLoaderImplemented', 'unknownFieldRegressionImplemented', 'inconsistentChangeRegressionImplemented', 'settingsReviewImplemented', 'responsiveReviewLayoutImplemented']) if (policy.qualityGate[key] !== true) failures.push(`G15F implementation gate drift: ${key}`)
for (const key of ['frontendProductionBuildComplete', 'rustTargetedTestComplete']) if (policy.qualityGate[key] !== true) failures.push(`G15F source validation gate drift: ${key}`)
for (const key of ['installedReviewComplete', 'realUserReceiptReviewed', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G15F pending gate must remain false: ${key}`)

for (const token of ['fn require_exact_json_keys', 'fn load_knowledge_graph_observation_comparison', '超过 1 MiB 安全上限', '包含不允许的字段', '隐私与版本校验', '变化值不一致', 'comparison_receipt_review_rejects_unknown_and_inconsistent_fields']) requireText(graph, token, `G15F backend validation missing: ${token}`)
for (const token of ['review_knowledge_graph_observation_comparison']) requireText(lib, token, `G15F command registration missing: ${token}`)
for (const token of ['data-testid="knowledge-session-review"', 'reviewKnowledgeObservationReceipt', "invoke<KnowledgeGraphObservationComparison>('review_knowledge_graph_observation_comparison'", 'data-testid="knowledge-session-review-result"', '本次审阅不会保存所选路径，也不会上传回执']) requireText(settings, token, `G15F Settings review missing: ${token}`)
for (const forbidden of ['sessionStorage.setItem(OBSERVATION_SESSION_KEY, receiptPath)', 'localStorage.setItem', 'observationReviewPath']) if (settings.includes(forbidden)) failures.push(`G15F receipt path persistence forbidden: ${forbidden}`)
for (const token of ["invokeTauri('review_knowledge_graph_observation_comparison'", 'unknownFieldRejected', "fs.rm(invalidKnowledgeComparisonFile, { force: true })", 'receiptReviewSurface.pathRendered', 'receiptReviewSurface.pathPersisted', "id: 'installed-local-comparison-receipt-review'", ...policy.installedAcceptance.expectedEvidenceFiles]) requireText(capture, token, `G15F installed runner marker missing: ${token}`)
for (const token of ['G15F', '严格', '未知字段', '不会上传', 'releaseCandidate=false']) requireText(audit, token, `G15F audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g15f-local-comparison-receipt-review'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g15f-local-comparison-receipt-review')) failures.push('G15F checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}
console.log('G15F local comparison receipt review passed: strict review is source-validated and the installed synthetic acceptance runner is integrated without retaining paths or uploading receipts; hosted execution remains pending.')
