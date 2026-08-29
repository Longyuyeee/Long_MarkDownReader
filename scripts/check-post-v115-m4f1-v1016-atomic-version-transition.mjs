import fs from 'node:fs'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const freeze = json('shared/post-v115-m4f0-v1016-release-freeze-entry-audit-policy.json')
const policy = json('shared/post-v115-m4f1-v1016-atomic-version-transition-policy.json')
const evidence = json('docs/evidence/post-v115-m4f1-v1016-atomic-version-transition/transition.json')
const development = json('shared/development-version-policy.json')
const community = json('shared/v1-community-release-policy.json')
const failures = []

if (policy.stage !== 'M4F-1' || policy.predecessor !== freeze.stage || freeze.selectedNextStage?.id !== policy.stage) failures.push('M4F-1 predecessor chain drifted')
if (evidence.stage !== policy.stage || evidence.status !== 'passed' || evidence.transitionBaseCommit !== policy.transitionBaseCommit || evidence.candidateTagExists !== false) failures.push('transition evidence identity drifted')
if (evidence.atomicTransition?.expectedFileCount !== 44 || evidence.atomicTransition?.changedVersionFileCount !== 44 || evidence.atomicTransition?.activeSharedVersions?.some(item => item.appVersion !== '1.0.16')) failures.push('atomic version transition evidence drifted')
if (evidence.atomicTransition?.historicalPins?.length !== 5 || evidence.atomicTransition.historicalPins.some(item => item.appVersion !== '1.0.15')) failures.push('historical version pins drifted')
if (Object.entries(evidence.versionState || {}).some(([key, value]) => key === 'publicVersion' ? value !== '1.0.15' : value !== '1.0.16')) failures.push('candidate identity drifted')
if (!evidence.candidateGateFacts?.allGatesPending || !evidence.candidateGateFacts?.candidateReceiptCleared || !evidence.candidateGateFacts?.releaseReceiptCleared || community.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('quality-gate-pending boundary drifted')
if (!evidence.publicBoundary?.candidateDoesNotReplacePublicRelease || development.publicVersion !== '1.0.15' || development.publicTag !== 'v1.0.15') failures.push('public release boundary drifted')
if (Object.values(evidence.metadataConsumerCorrection || {}).some(value => !value) || Object.values(evidence.documentationChecks || {}).some(value => !value)) failures.push('consumer correction or documentation evidence drifted')
if (evidence.gatePlan?.length !== 9 || evidence.gatePlan.filter(gate => gate.status === 'complete').length !== 2) failures.push('release gate plan drifted')
if (policy.selectedNextStage?.id !== 'M4F-2' || development.currentStage !== `${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`) failures.push('M4F-2 handoff drifted')
if (failures.length) { console.error(`M4F-1 atomic transition check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M4F-1 accepted: v1.0.16 binary identity and pending candidate metadata are atomic, v1.0.15 remains public, and M4F-2 is the sole next step.')
