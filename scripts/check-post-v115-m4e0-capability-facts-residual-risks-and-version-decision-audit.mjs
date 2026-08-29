import fs from 'node:fs'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const predecessor = readJson('shared/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit-policy.json')
const policy = readJson('shared/post-v115-m4e0-capability-facts-residual-risks-and-version-decision-audit-policy.json')
const development = readJson('shared/development-version-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4e0-capability-facts-residual-risks-and-version-decision-audit/decision.json')
const failures = []

if (policy.stage !== 'M4E-0' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M4E-0 predecessor chain drifted')
if (policy.decision !== evidence.versionDecision || policy.candidateVersion !== evidence.candidateVersion || evidence.status !== 'passed') failures.push('version decision evidence drifted')
if (Object.values(evidence.milestoneChecks || {}).some(value => !value) || Object.keys(evidence.milestoneChecks || {}).length !== 9) failures.push('milestone closure summary drifted')
if (Object.values(evidence.sourceChecks || {}).some(value => !value) || Object.keys(evidence.sourceChecks || {}).length !== 6) failures.push('source capability summary drifted')
if (Object.values(evidence.documentationChecks || {}).some(value => !value)) failures.push('documentation alignment drifted')
if (evidence.capabilityMatrix?.formatCount !== 43 || evidence.capabilityMatrix?.profileCount !== 11 || evidence.capabilityMatrix?.readinessCounts?.verified !== 30 || evidence.capabilityMatrix?.readinessCounts?.['verified-with-limitations'] !== 7 || evidence.capabilityMatrix?.readinessCounts?.['external-dependency'] !== 6) failures.push('capability matrix summary drifted')
if (evidence.residualRisks?.length !== 6 || evidence.residualRisks.some(item => !item.disposition.startsWith('non-blocking'))) failures.push('residual risk disposition drifted')
if (evidence.releaseFreezeGates?.length !== 9) failures.push('release-freeze gate inventory drifted')
if (policy.selectedNextStage?.id !== 'M4F-0' || development.currentStage !== `${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`) failures.push('M4F-0 handoff is not aligned')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false || development.runtimeBaseVersion !== '1.0.15') failures.push('release boundary changed early')

if (failures.length) { console.error(`M4E-0 capability and version decision check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M4E-0 accepted: cumulative 1.0.16 value is sufficient to enter release freeze, six residual risks remain bounded, and nine release gates are still mandatory before candidate or release status.')
