import fs from 'node:fs'
import path from 'node:path'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const policy = JSON.parse(fs.readFileSync('shared/r5l-management-rollback-closure-policy.json', 'utf8'))
const r5iEnvironment = JSON.parse(fs.readFileSync(
  'docs/evidence/r5i-isolated-install-lifecycle/environment-audit.json',
  'utf8',
))
const importedEvidencePath = 'docs/evidence/r5k-windows-matrix/imported/management-backup-index-evidence.json'
const importedEvidence = fs.existsSync(importedEvidencePath) ? JSON.parse(fs.readFileSync(importedEvidencePath, 'utf8')) : null
const hostedEvidencePassed = importedEvidence?.status === 'passed' && importedEvidence?.checks?.length === policy.requiredChecks.length
const requiredFiles = [
  'scripts/capture-r5l-management-rollback-smoke.mjs',
  'scripts/run-r5i-isolated-install-lifecycle.ps1',
  'scripts/new-r5i-windows-sandbox-config.ps1',
  'scripts/export-r5k-windows-evidence-bundle.ps1',
  'scripts/import-r5k-windows-evidence-bundle.ps1',
]
for (const file of requiredFiles) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error(`R5L required source file is missing: ${file}`)
  }
}

const outputPath = 'docs/evidence/r5l-management-rollback/preflight.json'
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  stage: 'R5L',
  appVersion: packageJson.version,
  capturedAt: new Date().toISOString(),
  currentStatus: policy.currentStatus,
  implementation: policy.implementation,
  currentHost: {
    isolatedRunnerAvailable: r5iEnvironment.execution.isolatedRunnerAvailable,
    existingProductRegistrationCount: r5iEnvironment.hostSafety.existingProductRegistrationCount,
    hostInstallerMutationAllowed: false,
  },
  execution: {
    disposableManagementEvidenceImported: hostedEvidencePassed,
    windows11Complete: false,
    windows10Complete: false,
    managementRollbackProven: hostedEvidencePassed,
    knowledgeIndexRecoveryProven: hostedEvidencePassed,
    releaseCandidate: false,
    promotionEligible: false,
    sourceUserContentIncluded: false,
  },
  evidenceContract: {
    exportedReceipt: 'management-backup-index-evidence.json',
    managementBackupZipExported: false,
    fixedSyntheticLibraryOnly: true,
    requiredCheckCount: policy.requiredChecks.length,
  },
}, null, 2)}\n`)

console.log(`R5L management rollback preflight captured: ${outputPath}`)
