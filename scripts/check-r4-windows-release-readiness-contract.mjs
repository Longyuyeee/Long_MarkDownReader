import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const fail = message => {
  console.error(message)
  process.exit(1)
}

const requireIncludes = (label, values, expected) => {
  for (const value of expected) {
    if (!values.includes(value)) fail(`${label} missing: ${value}`)
  }
}

const assertSameArray = (label, actual, expected) => {
  const left = [...actual].sort()
  const right = [...expected].sort()
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
    fail(`${label} mismatch: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`)
  }
}

const packageJson = json('package.json')
const cargoToml = read('src-tauri/Cargo.toml')
const tauriConfig = json('src-tauri/tauri.conf.json')
const lifecycle = json('shared/windows-lifecycle-policy.json')
const resilience = json('shared/data-resilience-policy.json')
const releaseMatrix = json('shared/release-capability-matrix.json')
const readiness = json('shared/windows-release-readiness-policy.json')

if (readiness.schemaVersion !== 1 || readiness.stage !== 'R4') fail('R4 readiness policy identity mismatch.')
if (readiness.releaseCandidate !== false) fail('R4A must keep releaseCandidate=false until real signing and VM evidence exist.')
if (readiness.status !== 'blocked-pending-signing-and-vm-evidence') fail('R4A status must be blocked by missing release evidence.')
if (readiness.nextStage !== 'R4E') fail('R4 readiness handoff must point to R4E after R4D.')

if (readiness.appVersion !== packageJson.version) fail('R4 appVersion must match package.json.')
if (readiness.appVersion !== tauriConfig.version) fail('R4 appVersion must match tauri.conf.json.')
if (!cargoToml.includes(`version = "${readiness.appVersion}"`)) fail('R4 appVersion must match Cargo.toml.')
if (lifecycle.appVersion !== readiness.appVersion) fail('R4 appVersion must match R2 lifecycle policy.')

if (readiness.baseline.lifecyclePolicy !== 'shared/windows-lifecycle-policy.json') fail('R4 must link the R2 lifecycle policy.')
if (readiness.baseline.dataResiliencePolicy !== 'shared/data-resilience-policy.json') fail('R4 must link the R3 data resilience policy.')
if (readiness.baseline.requiresR2LifecycleImplemented !== true) fail('R4 must require R2 lifecycle implementation.')
if (readiness.baseline.requiresR3DataResilienceImplemented !== true) fail('R4 must require R3 data resilience implementation.')

if (lifecycle.stage !== 'R2' || lifecycle.releaseCandidate !== false) fail('R2 lifecycle baseline must remain non-RC.')
if (resilience.stage !== 'R3' || resilience.releaseCandidate !== false || resilience.nextStage !== 'R4') fail('R3 resilience baseline must hand off to R4 and remain non-RC.')
for (const phase of ['R3A', 'R3B', 'R3C', 'R3D']) {
  const found = resilience.phases.find(item => item.id === phase)
  if (!found || found.status !== 'implemented') fail(`R3 phase must be implemented before R4 readiness: ${phase}`)
}

if (releaseMatrix.stage !== 'R2' || releaseMatrix.releaseCandidate !== false) {
  fail('Public release capability matrix must remain R2/non-RC until R4 evidence is complete.')
}

assertSameArray('installer targets', readiness.installerArtifacts.targets, lifecycle.installer.targets)
if (readiness.installerArtifacts.primaryTarget !== lifecycle.installer.primaryTarget) fail('R4 primary installer target must match R2.')
if (tauriConfig.bundle.active !== true) fail('Tauri bundle must remain enabled for R4.')
assertSameArray('Tauri bundle targets', tauriConfig.bundle.targets, readiness.installerArtifacts.targets)
if (tauriConfig.bundle.windows.allowDowngrades !== false || lifecycle.installer.allowDowngrades !== false) {
  fail('R4 requires downgrade protection.')
}
if (tauriConfig.bundle.windows.wix.upgradeCode !== lifecycle.installer.wixUpgradeCode) fail('WiX upgrade code mismatch.')
if (tauriConfig.bundle.windows.nsis.installMode !== lifecycle.installer.nsisInstallMode) fail('NSIS install mode mismatch.')

requireIncludes('R4 installer promotion gate', readiness.installerArtifacts.requiredBeforeReleaseCandidate, [
  'fresh-build-from-release-tag',
  'sha256-manifest',
  'signature-verification',
  'versioned-release-notes',
  'rollback-plan',
])
if (readiness.installerArtifacts.currentStatus !== 'hash-manifest-defined-unsigned-artifacts-not-promotable') fail('R4 artifact status mismatch.')
if (readiness.installerArtifacts.hashManifest !== 'shared/windows-release-artifact-manifest.json') fail('R4 hash manifest link missing.')

if (readiness.signing.required !== true) fail('R4 signing must be required.')
if (readiness.signing.currentStatus !== 'not-signed-artifacts-recorded') fail('R4 signing status must record not-signed artifacts.')
if (readiness.signing.evidenceManifest !== 'shared/windows-release-signing-evidence.json') fail('R4 signing evidence manifest link missing.')
if (readiness.signing.acceptedSubjects.length !== 0) fail('R4A must not list accepted signing subjects before evidence.')
if (readiness.signing.timestampRequired !== true) fail('R4 signing must require a timestamp.')
if (readiness.signing.signatureAlgorithm !== 'sha256') fail('R4 signing must require sha256.')
if (readiness.signing.failClosed !== true) fail('R4 signing must fail closed.')

if (readiness.vmMatrix.required !== true) fail('R4 VM matrix must be required.')
if (readiness.vmMatrix.currentStatus !== 'matrix-defined-results-missing') fail('R4 VM matrix status must record missing results.')
if (readiness.vmMatrix.evidenceManifest !== 'shared/windows-release-vm-matrix-evidence.json') fail('R4 VM evidence manifest link missing.')
requireIncludes('R4 VM Windows version', readiness.vmMatrix.windowsVersions, ['windows-10-x64', 'windows-11-x64'])
requireIncludes('R4 VM scenario', readiness.vmMatrix.scenarios, [
  'fresh-install',
  'upgrade-from-previous',
  'downgrade-rejection',
  'uninstall-retains-user-data',
  'file-association-recovery',
  'first-launch-after-install',
])

if (readiness.fileAssociations.sourceOfTruth !== 'shared/windows-lifecycle-policy.json') fail('R4 file association source mismatch.')
if (readiness.fileAssociations.defaultSelectionOwner !== lifecycle.fileAssociations.defaultSelectionOwner) fail('R4 file association owner mismatch.')
const lifecycleExtensions = lifecycle.fileAssociations.groups.flatMap(group => group.extensions)
assertSameArray('managed file associations', readiness.fileAssociations.managedExtensions, lifecycleExtensions)
assertSameArray('excluded dependency formats', readiness.fileAssociations.excludedExternalDependencyExtensions, lifecycle.fileAssociations.excludedDependencyFormats)

if (readiness.dataRetention.sourceOfTruth !== 'shared/windows-lifecycle-policy.json') fail('R4 data retention source mismatch.')
for (const key of [
  'knowledgeLibraries',
  'appConfig',
  'appCache',
  'uninstallerCustomDeletion',
  'legacyIdentifier',
  'migrationConflictPolicy',
]) {
  if (readiness.dataRetention[key] !== lifecycle.dataLifecycle[key]) fail(`R4 data retention mismatch: ${key}`)
}

requireIncludes('R4 forbidden promotion gate', readiness.promotionRules.forbiddenPromotionWithout, [
  'signing-evidence',
  'vm-matrix-evidence',
  'installer-hash-manifest',
  'release-notes',
  'rollback-plan',
])
if (readiness.promotionRules.releaseCapabilityMatrixMustRemainNonRcUntilEvidenceComplete !== true) {
  fail('R4 must keep public capability matrix non-RC until evidence is complete.')
}
if (readiness.promotionRules.debugOrUnsignedBuildsMustNotBeAdvertisedAsOfficialRelease !== true) {
  fail('R4 must block advertising debug or unsigned builds as official releases.')
}

const audit = read('docs/R4A_Windows_Release_Readiness_Contract_Audit_2026-07-30.md')
requireIncludes('R4A audit doc token', audit, [
  'R4A',
  'windows-release-readiness-policy.json',
  'blocked-pending-signing-and-vm-evidence',
  'releaseCandidate=false',
  'R4B',
])

const r4bAudit = read('docs/R4B_Windows_Release_Artifact_Manifest_Audit_2026-07-30.md')
requireIncludes('R4B audit doc token', r4bAudit, [
  'R4B',
  'windows-release-artifact-manifest.json',
  'promotionEligible=false',
  'R4C',
])

const r4cAudit = read('docs/R4C_Windows_Release_Signing_Evidence_Audit_2026-07-30.md')
requireIncludes('R4C audit doc token', r4cAudit, [
  'R4C',
  'windows-release-signing-evidence.json',
  'NotSigned',
  'R4D',
])

const r4dAudit = read('docs/R4D_Windows_VM_Matrix_Evidence_Audit_2026-07-30.md')
requireIncludes('R4D audit doc token', r4dAudit, [
  'R4D',
  'windows-release-vm-matrix-evidence.json',
  'matrix-defined-results-missing',
  'R4E',
])

console.log('R4 Windows release readiness contract passed: release candidate remains blocked pending signing and VM evidence.')
