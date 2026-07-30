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
const artifactManifest = json('shared/windows-release-artifact-manifest.json')
const signingEvidence = json('shared/windows-release-signing-evidence.json')
const vmEvidence = json('shared/windows-release-vm-matrix-evidence.json')
const releaseMatrix = json('shared/release-capability-matrix.json')

if (vmEvidence.schemaVersion !== 1 || vmEvidence.stage !== 'R4D') fail('R4D VM matrix evidence identity mismatch.')
if (vmEvidence.releaseCandidate !== false) fail('R4D VM matrix evidence must remain non-RC.')
if (vmEvidence.appVersion !== packageJson.version) fail('R4D appVersion must match package.json.')
if (vmEvidence.scope !== 'windows-vm-release-matrix-evidence-shape') fail('R4D VM matrix scope mismatch.')
if (vmEvidence.currentStatus !== 'matrix-defined-results-missing') fail('R4D must record that VM results are still missing.')
if (vmEvidence.promotionEligible !== false) fail('R4D VM evidence must not be promotion eligible.')
if (vmEvidence.nextStage !== 'R4E') fail('R4D handoff must point to R4E.')

if (readiness.stage !== 'R4' || readiness.releaseCandidate !== false) fail('R4 readiness baseline must remain non-RC.')
if (readiness.nextStage !== 'R4F') fail('R4 readiness policy must hand off to R4F after R4E.')
if (readiness.vmMatrix.currentStatus !== 'matrix-defined-results-missing') {
  fail('R4 readiness VM status must record matrix-defined-results-missing.')
}
if (readiness.vmMatrix.evidenceManifest !== 'shared/windows-release-vm-matrix-evidence.json') {
  fail('R4 readiness VM evidence manifest link missing.')
}
if (readiness.releaseNotes.currentStatus !== 'release-notes-and-rollback-defined-but-evidence-incomplete') {
  fail('R4 release notes status mismatch after R4E.')
}
if (readiness.rollbackPlan.currentStatus !== 'rollback-plan-defined-but-not-vm-validated') {
  fail('R4 rollback plan status mismatch after R4E.')
}
if (releaseMatrix.releaseCandidate !== false) fail('Public release capability matrix must remain non-RC.')

requireIncludes('R4D Windows version', vmEvidence.windowsVersions, ['windows-10-x64', 'windows-11-x64'])
requireIncludes('R4D required scenario', vmEvidence.requiredScenarios, [
  'fresh-install',
  'upgrade-from-previous',
  'downgrade-rejection',
  'uninstall-retains-user-data',
  'file-association-recovery',
  'first-launch-after-install',
])

requireIncludes('R4 readiness Windows version', readiness.vmMatrix.windowsVersions, vmEvidence.windowsVersions)
requireIncludes('R4 readiness scenario', readiness.vmMatrix.scenarios, vmEvidence.requiredScenarios)

if (vmEvidence.evidenceRequirements.artifactHashMustMatch !== 'shared/windows-release-artifact-manifest.json') {
  fail('R4D VM evidence must link the artifact manifest.')
}
if (vmEvidence.evidenceRequirements.signingEvidenceMustMatch !== 'shared/windows-release-signing-evidence.json') {
  fail('R4D VM evidence must link the signing evidence manifest.')
}
for (const key of [
  'screenshotsRequired',
  'commandLogsRequired',
  'expectedResultRequired',
  'actualResultRequired',
  'testerMachineFingerprintRequired',
  'mustNotIncludeUserDocumentBodies',
  'mustNotIncludeCredentials',
]) {
  if (vmEvidence.evidenceRequirements[key] !== true) fail(`R4D evidence requirement must be true: ${key}`)
}

if (artifactManifest.releaseCandidate !== false || artifactManifest.promotionEligible !== false) {
  fail('R4D depends on a non-promotable R4B artifact manifest.')
}
if (signingEvidence.releaseCandidate !== false || signingEvidence.promotionEligible !== false) {
  fail('R4D depends on non-promotable R4C signing evidence.')
}

const expectedPairs = new Set()
for (const windowsVersion of vmEvidence.windowsVersions) {
  for (const scenario of vmEvidence.requiredScenarios) {
    expectedPairs.add(`${windowsVersion}::${scenario}`)
  }
}

if (vmEvidence.matrix.length !== expectedPairs.size) fail('R4D VM matrix must contain every Windows/scenario pair exactly once.')

const seenPairs = new Set()
for (const item of vmEvidence.matrix) {
  const key = `${item.windowsVersion}::${item.scenario}`
  if (!expectedPairs.has(key)) fail(`Unexpected R4D VM matrix row: ${key}`)
  if (seenPairs.has(key)) fail(`Duplicate R4D VM matrix row: ${key}`)
  seenPairs.add(key)
  if (item.status !== 'missing') fail(`R4D VM result must remain missing until real VM evidence exists: ${key}`)
  if (item.evidencePath !== null) fail(`R4D VM evidence path must be null while result is missing: ${key}`)
  if (item.releaseBlocking !== true) fail(`R4D VM missing result must be release blocking: ${key}`)
}

const audit = read('docs/R4D_Windows_VM_Matrix_Evidence_Audit_2026-07-30.md')
requireIncludes('R4D audit doc token', audit, [
  'R4D',
  'windows-release-vm-matrix-evidence.json',
  'matrix-defined-results-missing',
  'releaseCandidate=false',
  'R4E',
])

console.log(`R4D Windows VM matrix evidence passed: ${vmEvidence.matrix.length} required VM checks defined and still blocking release.`)
