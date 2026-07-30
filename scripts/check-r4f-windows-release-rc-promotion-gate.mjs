import fs from 'node:fs'

const read = filePath => fs.readFileSync(filePath, 'utf8')
const json = filePath => JSON.parse(read(filePath))
const fail = message => {
  console.error(message)
  process.exit(1)
}

const requireIncludes = (label, values, expected) => {
  for (const value of expected) {
    if (!values.includes(value)) fail(`${label} missing: ${value}`)
  }
}

const packageJson = json('package.json')
const readiness = json('shared/windows-release-readiness-policy.json')
const lifecycle = json('shared/windows-lifecycle-policy.json')
const artifactManifest = json('shared/windows-release-artifact-manifest.json')
const signingEvidence = json('shared/windows-release-signing-evidence.json')
const vmEvidence = json('shared/windows-release-vm-matrix-evidence.json')
const releaseNotesRollback = json('shared/windows-release-notes-rollback-plan.json')
const publicMatrix = json('shared/release-capability-matrix.json')
const gate = json('shared/windows-release-rc-promotion-gate.json')

if (gate.schemaVersion !== 1 || gate.stage !== 'R4F') fail('R4F RC promotion gate identity mismatch.')
if (gate.releaseCandidate !== false) fail('R4F gate must keep releaseCandidate=false.')
if (gate.appVersion !== packageJson.version) fail('R4F appVersion must match package.json.')
if (gate.scope !== 'final-rc-promotion-gate') fail('R4F scope mismatch.')
if (gate.currentStatus !== 'blocked-pending-real-release-evidence') fail('R4F status mismatch.')
if (gate.promotionEligible !== false) fail('R4F gate must not be promotion eligible.')
if (gate.manualApprovalRequired !== true) fail('R4F must require manual approval before RC.')
if (gate.nextStage !== 'R5') fail('R4F handoff must point to R5.')

if (readiness.stage !== 'R4' || readiness.releaseCandidate !== false) fail('R4 readiness baseline must remain non-RC.')
if (readiness.nextStage !== 'R5') fail('R4 readiness policy must hand off to R5 after R4F.')
if (readiness.rcPromotionGate.currentStatus !== 'blocked-pending-real-release-evidence') fail('R4 readiness RC gate status mismatch.')
if (readiness.rcPromotionGate.evidenceManifest !== 'shared/windows-release-rc-promotion-gate.json') fail('R4 readiness RC gate manifest link missing.')
if (publicMatrix.releaseCandidate !== false) fail('Public capability matrix must remain non-RC.')

const expectedSources = {
  readiness: 'shared/windows-release-readiness-policy.json',
  artifacts: 'shared/windows-release-artifact-manifest.json',
  signing: 'shared/windows-release-signing-evidence.json',
  vmMatrix: 'shared/windows-release-vm-matrix-evidence.json',
  releaseNotesRollback: 'shared/windows-release-notes-rollback-plan.json',
  dataRetention: 'shared/windows-lifecycle-policy.json',
  publicCapabilityMatrix: 'shared/release-capability-matrix.json',
}
for (const [key, value] of Object.entries(expectedSources)) {
  if (gate.sourceManifests[key] !== value) fail(`R4F source manifest mismatch: ${key}`)
}

requireIncludes('R4F evidence id', gate.requiredEvidence.map(item => item.id), [
  'artifact-hash-manifest',
  'valid-authenticode-signing',
  'windows-vm-matrix',
  'release-notes',
  'rollback-plan',
  'data-retention-policy',
  'public-capability-matrix',
])

for (const evidence of gate.requiredEvidence) {
  if (evidence.passed !== false) fail(`R4F evidence must remain failed until real evidence exists: ${evidence.id}`)
  if (evidence.releaseBlocking !== true) fail(`R4F evidence must block release: ${evidence.id}`)
}

if (artifactManifest.promotionEligible !== false) fail('R4F expects artifact manifest to remain non-promotable.')
if (!artifactManifest.artifacts.every(item => item.promotionEligible === false && item.officialRelease === false)) {
  fail('R4F expects every artifact to remain non-official and non-promotable.')
}
if (signingEvidence.promotionEligible !== false) fail('R4F expects signing evidence to remain non-promotable.')
if (!signingEvidence.artifacts.every(item => item.releaseSigningState === 'not-signed' && item.promotionEligible === false)) {
  fail('R4F expects every signing artifact to remain not-signed and non-promotable.')
}
if (vmEvidence.promotionEligible !== false || vmEvidence.currentStatus !== 'matrix-defined-results-missing') {
  fail('R4F expects VM matrix to remain missing and non-promotable.')
}
if (!vmEvidence.matrix.every(item => item.status === 'missing' && item.releaseBlocking === true)) {
  fail('R4F expects every VM matrix row to remain missing and release-blocking.')
}
if (releaseNotesRollback.promotionEligible !== false) fail('R4F expects release notes/rollback plan to remain non-promotable.')
if (releaseNotesRollback.currentStatus !== 'release-notes-and-rollback-defined-but-evidence-incomplete') {
  fail('R4F expects release notes/rollback status to remain evidence-incomplete.')
}
if (lifecycle.dataLifecycle.knowledgeLibraries !== 'external-user-data-never-removed') fail('R4F data retention boundary mismatch.')
if (lifecycle.dataLifecycle.uninstallerCustomDeletion !== false) fail('R4F uninstaller deletion boundary mismatch.')

for (const [key, value] of Object.entries(gate.promotionRules)) {
  if (value !== true) fail(`R4F promotion rule must be true: ${key}`)
}

const audit = read('docs/R4F_Windows_RC_Promotion_Gate_Audit_2026-07-30.md')
requireIncludes('R4F audit doc token', audit, [
  'R4F',
  'windows-release-rc-promotion-gate.json',
  'blocked-pending-real-release-evidence',
  'releaseCandidate=false',
  'R5',
])

console.log(`R4F Windows RC promotion gate passed: ${gate.requiredEvidence.length} release gates are defined and still blocking RC promotion.`)
