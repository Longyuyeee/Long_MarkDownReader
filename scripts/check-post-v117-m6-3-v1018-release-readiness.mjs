import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/post-v117-m6-3-v1018-release-readiness-policy.json')
const predecessor = json('shared/post-v117-m6-2-v1018-next-slice-selection-policy.json')
const evidence = json('docs/evidence/post-v117-m6-3-v1018-release-readiness/audit.json')
const development = json('shared/development-version-policy.json')
const successor = json('shared/post-v117-m6-4-v1018-candidate-packaging-policy.json')
const hostedLifecycle = json('shared/post-v117-m6-5-v1018-hosted-installer-lifecycle-policy.json')
const finalReadiness = fs.existsSync('shared/post-v117-m6-6-v1018-final-artifact-manifest-release-readiness-policy.json')
  ? json('shared/post-v117-m6-6-v1018-final-artifact-manifest-release-readiness-policy.json') : null
const publishedRelease = fs.existsSync('shared/post-v117-m6-7-v1018-published-release-policy.json')
  ? json('shared/post-v117-m6-7-v1018-published-release-policy.json') : null
const release = json('shared/v1-community-release-policy.json')
const releaseChecker = read('scripts/check-v1-community-release.mjs')
const audit = read('docs/Post_v1.0.17_M6_3_v1.0.18_Quality_Debt_and_Release_Readiness_Audit_2026-08-31.md')
const roadmap = read('docs/Post_v1.0.17_v1.0.18_Professional_Capability_Roadmap_2026-08-31.md')
const alignment = read('docs/Development_Alignment_and_Closure_Plan_2026-08-02.md')
const failures = []
const fail = message => failures.push(message)

if (policy.stage !== 'M6-3' || policy.status !== 'accepted' || policy.predecessor !== predecessor.stage
  || predecessor.selectedNextStage?.id !== policy.stage || predecessor.selectedNextStage?.name !== policy.name) fail('M6-3 predecessor or acceptance drift')
if (policy.runtimeBaseVersion !== '1.0.17' || policy.publicVersion !== '1.0.17' || policy.developmentTargetVersion !== '1.0.18'
  || policy.binaryVersionChanged || policy.candidatePackageBuilt || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M6-3 version/privacy boundary drift')
if (policy.qualityDebt?.completeRustPassed !== 548 || policy.qualityDebt?.completeRustFailed !== 0 || policy.qualityDebt?.completeRustIgnored !== 5
  || policy.qualityDebt?.firstPatchReleaseAttemptPassed !== false || !policy.qualityDebt?.communityReleaseReceiptRunIdFixed
  || !policy.qualityDebt?.hostedLifecycleCandidateFieldAligned) fail('M6-3 real quality result drift')
if (!policy.releaseGate?.fullPatchReleaseCiPassed || policy.releaseGate?.frontendModulesBuilt !== 6275
  || policy.releaseGate?.formatCount !== 43 || policy.releaseGate?.extensionCount !== 91 || !policy.releaseGate?.cargoCheckPassed
  || policy.releaseGate?.productionVulnerabilities !== 0 || !policy.releaseGate?.packagingEligible) fail('M6-3 release gate drift')
const receiptRunAccepted = ['atomic-transition-complete-package-pending', 'accepted'].includes(successor.status)
  ? evidence.differencesAndCorrections?.some(item => item.correction?.includes('33361759629'))
  : release.candidate?.hostedInstalledLifecycleRunId === 33361759629
if (!receiptRunAccepted || !releaseChecker.includes('hosted.releaseCandidate !== false')) fail('M6-3 release receipt correction drift')
if (evidence.status !== 'passed' || evidence.actual?.completeRustPassed !== 548 || evidence.actual?.completeRustFailures !== 0
  || evidence.actual?.completeRustIgnored !== 5 || evidence.actual?.frontendModulesBuilt !== 6275 || evidence.actual?.patchReleaseCi !== 'passed-after-correction'
  || evidence.actual?.productionVulnerabilities !== 0 || evidence.differencesAndCorrections?.length !== 2 || !evidence.decision?.packagingEligible
  || evidence.decision?.binaryVersionChanged || evidence.decision?.candidatePackageBuilt || evidence.decision?.releaseCandidate
  || evidence.privacy?.sourceUserContentIncluded || evidence.privacy?.localAbsolutePathsIncluded) fail('M6-3 evidence drift')
if (policy.selectedNextStage?.id !== 'M6-4' || policy.selectedNextStage?.name !== 'v1.0.18-atomic-version-transition-and-candidate-packaging'
  || policy.nextAction !== 'execute-m6-4-v1.0.18-atomic-version-transition-and-candidate-packaging') fail('M6-4 handoff drift')
const m7Active = /^M7-[0-9]+-/.test(development.currentStage)
const runtimeAccepted = m7Active ? ['1.0.18', '1.0.19'].includes(development.runtimeBaseVersion) : ['atomic-transition-complete-package-pending', 'accepted'].includes(successor.status) ? development.runtimeBaseVersion === '1.0.18' : development.runtimeBaseVersion === '1.0.17'
const expectedDevelopmentStage = m7Active ? development.currentStage : publishedRelease?.status === 'published-and-remote-assets-verified'
  ? 'M6-8-v1.0.17-to-v1.0.18-managed-updater-observation'
  : finalReadiness?.status === 'accepted-ready-to-publish'
  ? 'M6-7-v1.0.18-tag-release-and-remote-asset-verification'
  : hostedLifecycle.status === 'hosted-installer-lifecycle-passed-release-readiness-pending'
  ? 'M6-6-v1.0.18-final-artifact-manifest-and-release-readiness-audit'
  : successor.status === 'accepted' ? `${successor.selectedNextStage.id}-${successor.selectedNextStage.name}` : `${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`
if (development.currentStage !== expectedDevelopmentStage || (m7Active && !development.binaryVersionTransition.startsWith(`v${development.runtimeBaseVersion}-`)) || !runtimeAccepted
  || !['1.0.17', '1.0.18', '1.0.19'].includes(development.publicVersion) || !['1.0.18', '1.0.19', '1.0.20'].includes(development.developmentTargetVersion) || development.releaseCandidate) fail('M6-4 development handoff drift')
for (const [document, tokens] of [[audit, ['548 通过、0 失败、5 忽略', '6,275 modules transformed', '33361759629', 'found 0 vulnerabilities', 'M6-4']], [roadmap, ['M6-3 质量与发布就绪回执', '548', 'M6-4']], [alignment, ['M6-3 已完成', '唯一接续点为 M6-4']]]) {
  for (const token of tokens) if (!document.includes(token)) fail(`M6-3 document missing ${token}`)
}

if (failures.length) {
  console.error(`M6-3 release readiness failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M6-3 accepted: 548 Rust tests, the corrected complete patch-release gate, 6,275 frontend modules and zero production vulnerabilities permit M6-4 candidate packaging.')
