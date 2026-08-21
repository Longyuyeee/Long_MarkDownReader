import crypto from 'node:crypto'
import fs from 'node:fs'

const read = filePath => fs.readFileSync(filePath, 'utf8')
const json = filePath => JSON.parse(read(filePath))
const fail = message => {
  console.error(message)
  process.exit(1)
}
const sha256 = filePath => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const packageJson = json('package.json')
const policy = json('shared/r5h-current-installer-evidence-policy.json')
const r5gPolicy = json('shared/r5g-desktop-artifact-smoke-policy.json')
const manifest = json(policy.evidence.manifest)
const capture = read('scripts/capture-r5h-current-installer-evidence.ps1')
const auditDoc = read('docs/R5H_Current_Windows_Installer_Evidence_Audit_2026-07-31.md')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5H') fail('R5H policy identity mismatch.')
if (policy.appVersion !== packageJson.version) fail('R5H appVersion must match package.json.')
if (policy.releaseCandidate !== false) fail('R5H must keep releaseCandidate=false.')
if (policy.currentStatus !== 'current-msi-nsis-built-hashed-unsigned-install-smoke-pending') fail('R5H current status mismatch.')
if (r5gPolicy.nextStage !== 'R5H') fail('R5G must hand off to R5H.')
if (policy.nextStage !== 'R5I') fail('R5H must hand off to R5I.')
if (policy.evidence.artifactFilesCommitted !== false || policy.evidence.sourceUserContentAllowed !== false) {
  fail('R5H evidence boundary mismatch.')
}
if (
  policy.releaseGate.currentInstallersBuilt !== true ||
  policy.releaseGate.currentInstallerHashesRecorded !== true ||
  policy.releaseGate.currentInstallerAuthenticodeRecorded !== true
) {
  fail('R5H local installer evidence gates must pass.')
}
if (
  policy.releaseGate.currentInstallersSigned !== false ||
  policy.releaseGate.installedArtifactSmokeExecuted !== false ||
  policy.releaseGate.signedArtifactRuntimeProven !== false ||
  policy.releaseGate.currentPromotionEligible !== false
) {
  fail('R5H must remain unsigned, uninstalled, and non-promotional.')
}

if (manifest.schemaVersion !== 1 || manifest.stage !== 'R5H') fail('R5H manifest identity mismatch.')
if (manifest.appVersion !== packageJson.version) fail('R5H manifest version mismatch.')
if (manifest.buildCommand !== 'npm run tauri -- build' || manifest.buildExecuted !== true) fail('R5H build evidence mismatch.')
if (
  manifest.releaseCandidate !== false ||
  manifest.promotionEligible !== false ||
  manifest.sourceUserContentIncluded !== false ||
  manifest.artifactFilesCommitted !== false ||
  manifest.installedArtifactSmokeExecuted !== false ||
  manifest.signedArtifactRuntimeProven !== false
) {
  fail('R5H manifest truth boundary mismatch.')
}

const targets = manifest.artifacts?.map(artifact => artifact.target).sort()
if (JSON.stringify(targets) !== JSON.stringify([...policy.requiredTargets].sort())) fail('R5H artifact target set mismatch.')
for (const artifact of manifest.artifacts) {
  if (!artifact.fileNamePattern.includes(packageJson.version)) fail(`R5H ${artifact.target} filename version mismatch.`)
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256 || '') || artifact.sizeBytes < 1_000_000) {
    fail(`R5H ${artifact.target} hash or size is invalid.`)
  }
  if (artifact.authenticodeStatus !== 'NotSigned' || artifact.signed !== false) {
    fail(`R5H ${artifact.target} must truthfully record NotSigned.`)
  }
  if (artifact.signerSubject !== null || artifact.timestampSubject !== null) {
    fail(`R5H ${artifact.target} must not claim signer or timestamp identity.`)
  }
  if (artifact.officialRelease !== false || artifact.promotionEligible !== false) {
    fail(`R5H ${artifact.target} must remain non-promotional.`)
  }

  if (fs.existsSync(artifact.relativeDirectory)) {
    const suffix = artifact.fileNamePattern.slice(1)
    const matches = fs.readdirSync(artifact.relativeDirectory).filter(fileName => fileName.endsWith(suffix))
    if (matches.length !== 1) fail(`R5H local ${artifact.target} artifact match count is ${matches.length}.`)
    const localPath = `${artifact.relativeDirectory}/${matches[0]}`
    const stats = fs.statSync(localPath)
    if (stats.size !== artifact.sizeBytes || sha256(localPath) !== artifact.sha256) {
      fail(`R5H local ${artifact.target} artifact does not match the committed evidence.`)
    }
  }
}

for (const token of [
  'npm run tauri -- build',
  'Get-AuthenticodeSignature',
  'Get-Sha256Hex',
  'Microsoft.PowerShell.Security.psd1',
  'sourceUserContentIncluded = $false',
  'installedArtifactSmokeExecuted = $false',
]) {
  if (!capture.includes(token)) fail(`R5H capture token missing: ${token}`)
}
for (const token of [
  'R5H',
  'current-msi-nsis-built-hashed-unsigned-install-smoke-pending',
  'releaseCandidate=false',
  'R5I',
]) {
  if (!auditDoc.includes(token)) fail(`R5H audit doc token missing: ${token}`)
}
for (const token of [
  'R5H update',
  'r5h-current-installer-evidence-policy.json',
  'current-msi-nsis-built-hashed-unsigned-install-smoke-pending',
  'R5I',
]) {
  if (!statusDoc.includes(token)) fail(`R5H status doc token missing: ${token}`)
}
if (!packageJson.scripts?.['audit:r5h-current-installer-evidence']) fail('R5H audit script is missing from package.json.')
if (!packageJson.scripts?.['check:r5h-current-installer-evidence']) fail('R5H check script is missing from package.json.')

console.log('R5H installer evidence passed: current MSI/NSIS hashes and unsigned Authenticode state are recorded without overstating install or RC readiness.')
