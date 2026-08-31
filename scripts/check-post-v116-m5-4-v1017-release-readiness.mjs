import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/post-v116-m5-4-v1017-release-readiness-policy.json')
const predecessor = json('shared/post-v116-m5-3-odp-workspace-policy.json')
const evidence = json('docs/evidence/post-v116-m5-4-v1017-release-readiness/audit.json')
const development = json('shared/development-version-policy.json')
const successor = json('shared/post-v116-m5-5-v1017-candidate-packaging-policy.json')
const workbook = read('src-tauri/src/commands/workbook.rs')
const registry = read('src-tauri/src/formats/file_registry.rs')
const knowledge = read('src-tauri/src/services/knowledge_index.rs')
const audit = read('docs/Post_v1.0.16_M5_4_v1.0.17_Quality_Debt_and_Release_Readiness_Audit_2026-08-31.md')
const failures = []
const fail = message => failures.push(message)

if (policy.stage !== 'M5-4' || policy.status !== 'accepted' || policy.predecessor !== predecessor.stage
  || predecessor.selectedNextStage?.id !== policy.stage) fail('M5-4 predecessor or acceptance drift')
if (policy.runtimeBaseVersion !== '1.0.16' || policy.publicVersion !== '1.0.16' || policy.developmentTargetVersion !== '1.0.17'
  || policy.binaryVersionChanged || policy.candidatePackageBuilt || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M5-4 version/privacy boundary drift')
if (policy.qualityDebt?.currentFullRustPassed !== 548 || policy.qualityDebt?.currentFullRustFailed !== 0
  || policy.qualityDebt?.currentFullRustIgnored !== 5 || !policy.qualityDebt?.workbookLayoutReadbackFixed
  || !policy.qualityDebt?.knowledgeIndexWatcherRaceFixed || !policy.qualityDebt?.pptxRegistryAssertionAligned) fail('M5-4 quality debt result drift')
if (!policy.releaseGate?.fullPatchReleaseCiPassed || !policy.releaseGate?.cargoCheckPassed
  || policy.releaseGate?.frontendModulesBuilt !== 6275 || policy.releaseGate?.formatCount !== 43
  || policy.releaseGate?.extensionCount !== 91 || policy.releaseGate?.productionVulnerabilities !== 0
  || !policy.releaseGate?.packagingEligible) fail('M5-4 release gate drift')
if (policy.selectedNextStage?.id !== 'M5-5' || policy.nextAction !== 'execute-m5-5-v1.0.17-atomic-version-transition-and-candidate-packaging') fail('M5-5 handoff drift')

for (const token of ['MAX_WORKBOOK_LAYOUT_ROWS', 'read_worksheet_layout(path, sheet, &signature, &source, total_rows)']) if (!workbook.includes(token)) fail(`Workbook layout fix missing ${token}`)
for (const token of ['pptx_is_basic_bounded_overwrite_edit_and_globally_indexed', 'SaveMode::BoundedOverwrite']) if (!registry.includes(token)) fail(`PPTX registry alignment missing ${token}`)
for (const token of ['current_source_digest = source_digest(&current_sources)', 'runtime.invalidate_snapshot(workspace)', 'stale_source_count']) if (!knowledge.includes(token)) fail(`knowledge index race fix missing ${token}`)

if (evidence.status !== 'passed' || evidence.actual?.fullRustPassed !== 548 || evidence.actual?.fullRustFailures !== 0
  || evidence.actual?.fullRustIgnored !== 5 || evidence.actual?.workbookBlankStyleReadback !== '#FFF2CC'
  || evidence.actual?.workbookMergeReadback !== 'D6:E6' || evidence.actual?.knowledgeIndexAfterNewFile !== 'stale'
  || evidence.actual?.patchReleaseCi !== 'passed' || evidence.actual?.productionVulnerabilities !== 0
  || evidence.differencesAndCorrections?.length !== 4 || !evidence.decision?.packagingEligible
  || evidence.decision?.binaryVersionChanged || evidence.decision?.candidatePackageBuilt || evidence.decision?.releaseCandidate
  || evidence.privacy?.sourceUserContentIncluded || evidence.privacy?.localAbsolutePathsIncluded) fail('M5-4 evidence drift')

for (const token of ['真实测试：预期、实际、差异与修正', '548 通过、0 失败、5 忽略', '6,275', '生产依赖漏洞为 0', 'M5-5']) if (!audit.includes(token)) fail(`M5-4 audit missing ${token}`)
const expectedDevelopmentStage = successor.status === 'accepted'
  ? `${successor.selectedNextStage.id}-${successor.selectedNextStage.name}`
  : `${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`
if (development.currentStage !== expectedDevelopmentStage) fail('development handoff is not aligned with M5-5 progression')

if (failures.length) {
  console.error(`M5-4 release readiness failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M5-4 accepted: 548 Rust tests pass with zero failures, the complete patch release gate passes, and M5-5 owns atomic v1.0.17 packaging.')
