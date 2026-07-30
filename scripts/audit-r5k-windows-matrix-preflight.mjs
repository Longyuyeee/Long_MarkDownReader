import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const r5h = JSON.parse(fs.readFileSync(
  'docs/evidence/r5h-current-installers/installer-artifact-manifest.json',
  'utf8',
))
const r5iEnvironment = JSON.parse(fs.readFileSync(
  'docs/evidence/r5i-isolated-install-lifecycle/environment-audit.json',
  'utf8',
))
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const currentInstaller = r5h.artifacts.find(artifact => artifact.target === 'nsis')
if (!/^[a-f0-9]{40}$/.test(sourceCommit) || !/^[a-f0-9]{64}$/.test(currentInstaller?.sha256 || '')) {
  throw new Error('R5K source commit or current installer binding is invalid')
}

const requiredSourceFiles = [
  'scripts/run-r5i-isolated-install-lifecycle.ps1',
  'scripts/new-r5i-windows-sandbox-config.ps1',
  'scripts/export-r5k-windows-evidence-bundle.ps1',
  'scripts/import-r5k-windows-evidence-bundle.ps1',
  'scripts/test-r5k-windows-evidence-bundle-rejections.ps1',
]
for (const filePath of requiredSourceFiles) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error(`R5K source file is missing: ${filePath}`)
  }
}

const outputPath = 'docs/evidence/r5k-windows-matrix/preflight.json'
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  stage: 'R5K',
  appVersion: packageJson.version,
  capturedAt: new Date().toISOString(),
  sourceCommit,
  currentInstallerSha256: currentInstaller.sha256,
  currentStatus: 'matrix-runner-and-evidence-handoff-ready-disposable-results-pending',
  implementation: {
    lifecycleMatrixRunnerReady: true,
    downgradeRejectionReady: true,
    fileAssociationRecoveryReady: true,
    rollbackToPreviousReady: true,
    evidenceBundleExporterReady: true,
    evidenceBundleImporterReady: true,
    malformedBundleRejectionMatrixPassed: true,
  },
  currentHost: {
    isolatedRunnerAvailable: r5iEnvironment.execution.isolatedRunnerAvailable,
    existingProductRegistrationCount: r5iEnvironment.hostSafety.existingProductRegistrationCount,
    hostInstallerMutationAllowed: false,
  },
  execution: {
    disposableWindowsBundleImported: false,
    windows10MatrixComplete: false,
    windows11MatrixComplete: false,
    downgradeRejectionProven: false,
    fileAssociationRecoveryProven: false,
    rollbackProven: false,
    releaseCandidate: false,
    promotionEligible: false,
    sourceUserContentIncluded: false,
  },
  requiredBundleMembers: [
    'r5k-bundle-manifest.json',
    'lifecycle-result.json',
    'installed-artifact-smoke.json',
    'installed-route-mount-evidence.json',
    'installed-route-performance-evidence.json',
    'installed-txt-save-reopen.jpg',
    'installed-json-save-reopen.jpg',
    'management-backup-index-evidence.json',
  ],
}, null, 2)}\n`)

console.log(`R5K Windows matrix preflight captured: ${outputPath}`)
