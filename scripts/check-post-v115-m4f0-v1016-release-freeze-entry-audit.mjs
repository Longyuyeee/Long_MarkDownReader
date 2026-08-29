import fs from 'node:fs'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/post-v115-m4f0-v1016-release-freeze-entry-audit-policy.json')
const transition = json('shared/post-v115-m4f1-v1016-atomic-version-transition-policy.json')
const predecessor = json('shared/post-v115-m4e0-capability-facts-residual-risks-and-version-decision-audit-policy.json')
const development = json('shared/development-version-policy.json')
const evidence = json('docs/evidence/post-v115-m4f0-v1016-release-freeze-entry-audit/freeze-entry.json')
const failures = []

if (policy.stage !== 'M4F-0' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M4F-0 predecessor chain drifted')
if (evidence.stage !== policy.stage || evidence.status !== 'passed' || evidence.frozenProductCommit !== policy.frozenProductCommit || evidence.frozenCommitWasOriginMain !== true || evidence.candidateTagExists !== false) failures.push('frozen product identity drifted')
if (evidence.atomicVersionScope?.activeSharedFileCount !== 38 || evidence.atomicVersionScope?.totalFileCount !== 44 || evidence.atomicVersionScope?.historicalPins?.length !== 5) failures.push('atomic version inventory drifted')
if (evidence.runtimeSmokeCorrection?.historicalR5eQualifiesAsCurrentCandidatePass !== false || evidence.runtimeSmokeCorrection?.r5fRouteMountContractPresent !== true || evidence.runtimeSmokeCorrection?.r5gDesktopRouteIoContractPresent !== true) failures.push('runtime smoke correction drifted')
if (Object.values(evidence.workflowChecks || {}).some(value => !value)) failures.push('release workflow readiness drifted')
if (evidence.gatePlan?.length !== 9 || evidence.gatePlan.filter(gate => gate.status === 'complete').length !== 1 || evidence.gatePlan[0]?.id !== 'freeze-product-commit') failures.push('release gate plan drifted')
if (policy.selectedNextStage?.id !== transition.stage || transition.predecessor !== policy.stage || development.currentStage !== `${transition.selectedNextStage.id}-${transition.selectedNextStage.name}`) failures.push('M4F successor handoff is not aligned')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false || development.publicVersion !== '1.0.15') failures.push('release boundary changed before publication')

if (failures.length) { console.error(`M4F-0 release freeze entry check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M4F-0 accepted: the product commit is frozen, the 44-file atomic transition is explicit, historical R5E blocker evidence is excluded, and M4F-1 is the sole next step.')
