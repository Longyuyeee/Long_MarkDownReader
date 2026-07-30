import crypto from 'node:crypto'
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

const sha256File = filePath => {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

const packageJson = json('package.json')
const readiness = json('shared/windows-release-readiness-policy.json')
const artifactManifest = json('shared/windows-release-artifact-manifest.json')
const signing = json('shared/windows-release-signing-evidence.json')
const releaseMatrix = json('shared/release-capability-matrix.json')

if (signing.schemaVersion !== 1 || signing.stage !== 'R4C') fail('R4C signing evidence identity mismatch.')
if (signing.releaseCandidate !== false) fail('R4C signing evidence must remain non-RC.')
if (signing.appVersion !== packageJson.version) fail('R4C appVersion must match package.json.')
if (signing.scope !== 'historical-local-installer-signing-evidence') fail('R4C signing scope mismatch.')
if (signing.verificationTool !== 'PowerShell Get-AuthenticodeSignature') fail('R4C verification tool mismatch.')
if (signing.promotionEligible !== false) fail('R4C signing evidence must not be promotion eligible.')
if (signing.nextStage !== 'R4D') fail('R4C handoff must point to R4D.')

if (readiness.stage !== 'R4' || readiness.releaseCandidate !== false) fail('R4 readiness baseline must remain non-RC.')
if (readiness.nextStage !== 'R5') fail('R4 readiness policy must hand off to R5 after R4F.')
if (readiness.signing.currentStatus !== 'not-signed-artifacts-recorded') {
  fail('R4 readiness signing status must record the current not-signed state.')
}
if (readiness.signing.evidenceManifest !== 'shared/windows-release-signing-evidence.json') {
  fail('R4 readiness signing evidence manifest link missing.')
}
if (readiness.signing.required !== true || readiness.signing.timestampRequired !== true || readiness.signing.failClosed !== true) {
  fail('R4 signing must remain required, timestamped, and fail-closed.')
}
if (readiness.signing.acceptedSubjects.length !== 0) fail('R4C must not define accepted subjects before real signing material exists.')
if (readiness.vmMatrix.currentStatus !== 'matrix-defined-results-missing') fail('R4 VM matrix status must record missing results after R4D.')
if (readiness.vmMatrix.evidenceManifest !== 'shared/windows-release-vm-matrix-evidence.json') fail('R4 VM evidence manifest link missing after R4D.')
if (readiness.releaseNotes.currentStatus !== 'release-notes-and-rollback-defined-but-evidence-incomplete') {
  fail('R4 release notes status mismatch after R4E.')
}
if (readiness.rollbackPlan.currentStatus !== 'rollback-plan-defined-but-not-vm-validated') {
  fail('R4 rollback plan status mismatch after R4E.')
}
if (readiness.rcPromotionGate.currentStatus !== 'blocked-pending-real-release-evidence') {
  fail('R4 RC promotion gate status mismatch after R4F.')
}
if (readiness.rcPromotionGate.evidenceManifest !== 'shared/windows-release-rc-promotion-gate.json') {
  fail('R4 RC promotion gate evidence manifest link missing after R4F.')
}
if (releaseMatrix.releaseCandidate !== false) fail('Public release capability matrix must remain non-RC.')

requireIncludes('R4C release prerequisite', signing.requiredBeforeReleaseCandidate, [
  'valid-authenticode-signature',
  'sha256-digest-matches-artifact-manifest',
  'timestamp-certificate-present',
  'accepted-certificate-subject-defined',
  'windows-vm-matrix-complete',
])
requireIncludes('R4C accepted state', signing.acceptedReleaseStates, ['official-signed'])
requireIncludes('R4C rejected state', signing.rejectedReleaseStates, [
  'unsigned',
  'not-signed',
  'unknown',
  'invalid',
  'test-signed',
])

const artifactsByPath = new Map(artifactManifest.artifacts.map(artifact => [artifact.path, artifact]))
if (signing.artifacts.length !== artifactManifest.artifacts.length) {
  fail('R4C signing artifact count must match the R4B artifact manifest.')
}

for (const artifact of signing.artifacts) {
  const listed = artifactsByPath.get(artifact.path)
  if (!listed) fail(`R4C signing artifact missing from R4B manifest: ${artifact.path}`)
  if (artifact.sha256 !== listed.sha256) fail(`R4C signing hash mismatch with R4B manifest: ${artifact.path}`)
  const actualHash = sha256File(artifact.path)
  if (actualHash !== artifact.sha256) fail(`R4C signing hash mismatch with filesystem: ${artifact.path}`)
  if (artifact.authenticodeStatus !== 'NotSigned') fail(`R4C historical artifact must record NotSigned: ${artifact.path}`)
  if (artifact.releaseSigningState !== 'not-signed') fail(`R4C release signing state must be not-signed: ${artifact.path}`)
  if (artifact.signerSubject !== null || artifact.timestampSubject !== null) {
    fail(`R4C must not invent signer or timestamp subjects: ${artifact.path}`)
  }
  if (artifact.officialRelease !== false || artifact.promotionEligible !== false) {
    fail(`R4C not-signed artifact must not be official or promotable: ${artifact.path}`)
  }
}

const audit = read('docs/R4C_Windows_Release_Signing_Evidence_Audit_2026-07-30.md')
requireIncludes('R4C audit doc token', audit, [
  'R4C',
  'windows-release-signing-evidence.json',
  'NotSigned',
  'promotionEligible=false',
  'R4D',
])

console.log(`R4C Windows release signing evidence passed: ${signing.artifacts.length} artifacts verified as not signed and blocked from promotion.`)
