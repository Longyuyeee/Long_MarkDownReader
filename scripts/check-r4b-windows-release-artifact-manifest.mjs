import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

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
const manifest = json('shared/windows-release-artifact-manifest.json')
const releaseMatrix = json('shared/release-capability-matrix.json')

if (manifest.schemaVersion !== 1 || manifest.stage !== 'R4B') fail('R4B artifact manifest identity mismatch.')
if (manifest.releaseCandidate !== false) fail('R4B artifact manifest must remain non-RC.')
if (manifest.appVersion !== packageJson.version) fail('R4B appVersion must match package.json.')
if (manifest.sourceDirectory !== 'releases') fail('R4B artifact source directory mismatch.')
if (manifest.scope !== 'historical-local-installer-artifacts') fail('R4B scope must identify historical local artifacts.')
if (manifest.promotionEligible !== false) fail('R4B manifest must not be promotion eligible.')
if (manifest.nextStage !== 'R4C') fail('R4B handoff must point to R4C.')

if (readiness.stage !== 'R4' || readiness.releaseCandidate !== false) fail('R4 readiness baseline must remain non-RC.')
if (readiness.nextStage !== 'R5') fail('R4 readiness policy must hand off to R5 after R4F.')
if (readiness.installerArtifacts.hashManifest !== 'shared/windows-release-artifact-manifest.json') {
  fail('R4 readiness policy must link the artifact hash manifest.')
}
if (readiness.installerArtifacts.currentStatus !== 'hash-manifest-defined-unsigned-artifacts-not-promotable') {
  fail('R4 readiness artifact status must identify hash-manifest-defined but non-promotable artifacts.')
}
if (readiness.signing.currentStatus !== 'not-signed-artifacts-recorded') fail('R4 signing status must record not-signed artifacts after R4C.')
if (readiness.signing.evidenceManifest !== 'shared/windows-release-signing-evidence.json') fail('R4 signing evidence manifest link missing after R4C.')
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

requireIncludes('R4B promotion blocker', manifest.promotionBlockers, [
  'not-built-from-current-release-tag',
  'signature-status-not-verified',
  'windows-vm-matrix-missing',
  'release-notes-missing',
  'rollback-plan-missing',
])

if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length < 1) fail('R4B manifest must list at least one artifact.')

const seen = new Set()
for (const artifact of manifest.artifacts) {
  if (seen.has(artifact.path)) fail(`Duplicate artifact path: ${artifact.path}`)
  seen.add(artifact.path)
  if (!artifact.path.startsWith('releases/')) fail(`Artifact must stay under releases/: ${artifact.path}`)
  if (path.basename(artifact.path) !== artifact.fileName) fail(`Artifact fileName mismatch: ${artifact.path}`)
  if (artifact.kind !== 'historical-installer') fail(`Artifact kind must be historical-installer: ${artifact.path}`)
  if (artifact.signatureStatus !== 'not-verified') fail(`R4B must not claim signature verification: ${artifact.path}`)
  if (artifact.officialRelease !== false || artifact.promotionEligible !== false) {
    fail(`R4B artifact must not be official or promotable: ${artifact.path}`)
  }
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) fail(`Invalid SHA-256 digest: ${artifact.path}`)
  const stat = fs.statSync(artifact.path)
  if (stat.size !== artifact.sizeBytes) fail(`Artifact size mismatch: ${artifact.path}`)
  const actualHash = sha256File(artifact.path)
  if (actualHash !== artifact.sha256) fail(`Artifact SHA-256 mismatch: ${artifact.path}`)
}

const audit = read('docs/R4B_Windows_Release_Artifact_Manifest_Audit_2026-07-30.md')
requireIncludes('R4B audit doc token', audit, [
  'R4B',
  'windows-release-artifact-manifest.json',
  'promotionEligible=false',
  'not-verified',
  'R4C',
])

console.log(`R4B Windows release artifact manifest passed: ${manifest.artifacts.length} historical artifacts hashed and blocked from promotion.`)
