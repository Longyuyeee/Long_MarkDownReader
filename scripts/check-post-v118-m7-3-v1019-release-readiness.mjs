import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []
const fail = message => failures.push(message)
const policy = json('shared/post-v118-m7-3-v1019-release-readiness-policy.json')
const predecessor = json('shared/post-v118-m7-2-local-json-schema-product-policy.json')
const evidence = json('docs/evidence/post-v118-m7-3-v1019-release-readiness/audit.json')
const development = json('shared/development-version-policy.json')
const audit = read('docs/Post_v1.0.18_M7_3_v1.0.19_Quality_Debt_and_Release_Readiness_Audit_2026-08-31.md')
const roadmap = read('docs/Post_v1.0.18_v1.0.19_Professional_Capability_Roadmap_2026-08-31.md')
const alignment = read('docs/Development_Alignment_and_Closure_Plan_2026-08-02.md')
const handoff = read('docs/Development_Handoff.md')

if (policy.stage !== 'M7-3' || policy.status !== 'accepted' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M7-3 predecessor/identity drift')
if (policy.runtimeBaseVersion !== '1.0.18' || policy.publicVersion !== '1.0.18' || policy.developmentTargetVersion !== '1.0.19' || policy.binaryVersionChanged || policy.candidatePackageBuilt || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M7-3 version/privacy boundary drift')
if (policy.qualityDebt?.completeRustPassed !== 559 || policy.qualityDebt?.completeRustFailed !== 0 || policy.qualityDebt?.completeRustIgnored !== 5 || policy.qualityDebt?.supplementalStrictClippyExistingFindings !== 43 || policy.qualityDebt?.newSchemaSourceFindings !== 0 || policy.qualityDebt?.strictClippyIsReleaseGate) fail('M7-3 quality result drift')
if (!policy.releaseGate?.fullPatchReleaseCiPassed || policy.releaseGate?.frontendModulesBuilt !== 6275 || policy.releaseGate?.formatCount !== 43 || policy.releaseGate?.extensionCount !== 91 || !policy.releaseGate?.cargoCheckPassed || policy.releaseGate?.productionVulnerabilities !== 0 || !policy.releaseGate?.packagingEligible) fail('M7-3 release gate drift')
if (evidence.status !== 'passed' || evidence.actual?.completeRustPassed !== 559 || evidence.actual?.completeRustFailures !== 0 || evidence.actual?.completeRustIgnored !== 5 || evidence.actual?.patchReleaseCi !== 'passed-first-attempt' || evidence.actual?.productionVulnerabilities !== 0 || evidence.actual?.supplementalStrictClippy?.existingFindings !== 43 || evidence.actual?.supplementalStrictClippy?.newSchemaSourceFindings !== 0 || evidence.differencesAndCorrections?.length !== 0 || !evidence.decision?.packagingEligible || evidence.decision?.binaryVersionChanged || evidence.decision?.candidatePackageBuilt || evidence.decision?.releaseCandidate || evidence.privacy?.sourceUserContentIncluded || evidence.privacy?.localAbsolutePathsIncluded) fail('M7-3 evidence drift')
if (policy.selectedNextStage?.id !== 'M7-4' || policy.selectedNextStage?.name !== 'v1.0.19-atomic-version-transition-and-candidate-packaging' || policy.nextAction !== 'execute-m7-4-v1.0.19-atomic-version-transition-and-candidate-packaging') fail('M7-4 handoff policy drift')
if (development.currentStage !== 'M7-4-v1.0.19-atomic-version-transition-and-candidate-packaging' || development.runtimeBaseVersion !== '1.0.19' || development.publicVersion !== '1.0.18' || development.developmentTargetVersion !== '1.0.19' || development.releaseCandidate) fail('M7-4 development handoff drift')
for (const [document, tokens] of [[audit, ['559 通过、0 失败、5 忽略', '6,275 modules transformed', '43 条历史', 'found 0 vulnerabilities', 'M7-4']], [roadmap, ['M7-3 质量与发布就绪回执', '559', 'M7-4']], [alignment, ['M7-3 已完成', '唯一接续点为 M7-4']], [handoff, ['M7-3 质量与发布就绪已通过', 'M7-4']]]) for (const token of tokens) if (!document.includes(token)) fail(`M7-3 document missing: ${token}`)

if (failures.length) { console.error(`M7-3 release readiness failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M7-3 accepted: 559 Rust tests, complete patch-release CI, 6,275 frontend modules and zero production vulnerabilities permit M7-4 candidate packaging.')
