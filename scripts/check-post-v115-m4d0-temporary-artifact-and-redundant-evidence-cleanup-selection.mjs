import crypto from 'node:crypto'
import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const policy = readJson('shared/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection-policy.json')
const successor = readJson('shared/post-v115-m4d1-bounded-generated-graph-export-artifact-cleanup-policy.json')
const cleanupExit = readJson('shared/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit-policy.json')
const capabilityDecision = readJson('shared/post-v115-m4e0-capability-facts-residual-risks-and-version-decision-audit-policy.json')
const freezeEntry = readJson('shared/post-v115-m4f0-v1016-release-freeze-entry-audit-policy.json')
const predecessor = readJson('shared/post-v115-m4c6-controlled-conversion-exit-audit-policy.json')
const development = readJson('shared/development-version-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection/inventory.json')
const tier = readJson('docs/evidence/post-v115-m3c4-large-graph-performance-exit-audit/tier-5000.json')
const failures = []

if (policy.stage !== 'M4D-0' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M4D-0 predecessor chain drifted')
if (policy.auditBaselineCommit !== evidence.sourceCommit || evidence.stage !== policy.stage || evidence.status !== 'passed') failures.push('selection evidence baseline or status drifted')
if (evidence.inventory?.addedFileCount !== 931 || evidence.inventory?.addedBytes !== 58155445 || evidence.inventory?.addedScriptCount !== 179 || evidence.inventory?.addedEvidenceCount !== 573) failures.push('cycle inventory facts drifted')
if (JSON.stringify(evidence.inventory?.addedScriptFamilies) !== JSON.stringify({ capture: 45, check: 74, invoke: 1, run: 58, verify: 1 })) failures.push('reproducible script family inventory drifted')
if (evidence.inventory?.exactDuplicateGroupCount !== 8 || evidence.inventory?.exactDuplicatePathCount !== 16 || evidence.decisions?.duplicateEvidenceSelectedForRemoval !== 0) failures.push('semantic duplicate classification drifted')
if (policy.selection?.files?.join(',') !== evidence.candidates?.map(item => item.file).join(',') || policy.selection?.bytes !== evidence.inventory?.selectedCandidateBytes || evidence.candidates?.length !== 4) failures.push('selected payload set drifted')
for (const candidate of evidence.candidates || []) {
  const [scope, format] = candidate.file.includes('/full-') ? ['full', candidate.file.endsWith('.svg') ? 'svg' : 'png'] : ['filtered', candidate.file.endsWith('.svg') ? 'svg' : 'png']
  const retained = tier.actual?.exports?.[scope]?.[format]
  if (!candidate.retainedMetricsMatch || !candidate.generatedByExistingHarness || candidate.directlyConsumedByChecker || candidate.releaseDependencyObserved || retained?.bytes !== candidate.bytes || retained?.sha256 !== candidate.sha256) failures.push(`candidate replacement evidence failed: ${candidate.file}`)
  if (fs.existsSync(candidate.file) && sha256(candidate.file) !== candidate.sha256) failures.push(`candidate working-tree bytes drifted: ${candidate.file}`)
}
if (evidence.duplicateGroups?.some(group => group.selectedForRemoval || !policy.protectedDuplicateClasses.includes(group.classification))) failures.push('protected duplicate semantics drifted')
if (evidence.ignoredLocalState?.some(item => item.trackedAtBaseline || !item.ignoredByPolicy || item.cleanupScope !== 'local-only-excluded-from-tracked-M4D-selection')) failures.push('ignored local state boundary drifted')
if (policy.selectedNextStage?.id !== successor.stage || successor.predecessor !== policy.stage || successor.selectedNextStage?.id !== cleanupExit.stage || cleanupExit.predecessor !== successor.stage || cleanupExit.selectedNextStage?.id !== capabilityDecision.stage || capabilityDecision.predecessor !== cleanupExit.stage || capabilityDecision.selectedNextStage?.id !== freezeEntry.stage || freezeEntry.predecessor !== capabilityDecision.stage || development.currentStage !== `${freezeEntry.selectedNextStage.id}-${freezeEntry.selectedNextStage.name}`) failures.push('M4 successor handoff is not aligned')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) { console.error(`M4D-0 cleanup selection check failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M4D-0 accepted: only four reproducible M3C-4 export payloads are selected; audit harnesses, semantic duplicate evidence and release dependencies remain protected.')
