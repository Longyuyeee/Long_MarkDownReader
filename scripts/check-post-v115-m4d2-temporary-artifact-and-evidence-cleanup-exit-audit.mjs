import fs from 'node:fs'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const predecessor = readJson('shared/post-v115-m4d1-bounded-generated-graph-export-artifact-cleanup-policy.json')
const policy = readJson('shared/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit-policy.json')
const development = readJson('shared/development-version-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit/exit-evidence.json')
const failures = []

if (policy.stage !== 'M4D-2' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M4D-2 predecessor chain drifted')
if (policy.closureDecision !== 'passed-bounded-cleanup-scope' || evidence.status !== 'passed' || evidence.closureDecision !== policy.closureDecision) failures.push('cleanup closure decision drifted')
if (evidence.actualDeletions?.length !== 4 || evidence.authorizedDeletionCount !== 4 || evidence.authorizedDeletionBytes !== 13883957 || evidence.unexpectedDeletionCount !== 0) failures.push('bounded deletion facts drifted')
if (evidence.protectedCyclePathCount !== 927 || evidence.protectedCyclePathsPresent !== 927 || evidence.missingProtectedCyclePaths?.length !== 0) failures.push('protected cycle path facts drifted')
if (evidence.remainingPostV115NativePayloads?.length !== 0 || evidence.omittedEquivalentCandidateCount !== 0) failures.push('equivalent generated payload omission detected')
if (evidence.retainedMetrics?.length !== 4 || evidence.retainedMetrics.some(item => !item.matchesCleanupEvidence)) failures.push('retained metric evidence drifted')
if (Object.values(evidence.runnerContract || {}).some(value => !value)) failures.push('future runner cleanup contract drifted')
if (evidence.inventoryClosure?.addedFileCount !== 931 || evidence.inventoryClosure?.selectedCandidateCount !== 4 || evidence.inventoryClosure?.protectedDuplicateCount !== 8 || evidence.inventoryClosure?.scriptsSelectedForRemoval !== 0 || evidence.inventoryClosure?.duplicateEvidenceSelectedForRemoval !== 0) failures.push('inventory closure facts drifted')
for (const file of evidence.actualDeletions || []) if (fs.existsSync(file)) failures.push(`deleted payload returned: ${file}`)
if (policy.selectedNextStage?.id !== 'M4E-0' || development.currentStage !== `${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`) failures.push('M4E-0 handoff is not aligned')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) { console.error(`M4D-2 cleanup exit check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M4D closed: only four authorized generated payloads were removed, 927 protected cycle paths remain, replacement metrics and future cleanup are bounded, and no equivalent native payload candidate remains.')
