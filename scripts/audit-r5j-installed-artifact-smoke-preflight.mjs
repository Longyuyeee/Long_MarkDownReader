import fs from 'node:fs'
import path from 'node:path'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const r5iEnvironment = JSON.parse(fs.readFileSync(
  'docs/evidence/r5i-isolated-install-lifecycle/environment-audit.json',
  'utf8',
))
const version = packageJson.version
const nsisDirectory = 'src-tauri/target/release/bundle/nsis'
const installers = fs.readdirSync(nsisDirectory)
const currentMatches = installers.filter(fileName => fileName.endsWith(`_${version}_x64-setup.exe`))
const previousMatches = installers.filter(fileName => fileName.endsWith('_0.6.2_x64-setup.exe'))
const requiredSourceFiles = [
  'scripts/run-r5i-isolated-install-lifecycle.ps1',
  'scripts/new-r5i-windows-sandbox-config.ps1',
  'scripts/capture-r5j-installed-artifact-smoke.mjs',
]
for (const filePath of requiredSourceFiles) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error(`R5J source file is missing: ${filePath}`)
  }
}
if (currentMatches.length !== 1 || previousMatches.length !== 1) {
  throw new Error('R5J requires exactly one current and one controlled previous NSIS installer')
}

const outputPath = 'docs/evidence/r5j-installed-artifact-smoke/preflight.json'
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  stage: 'R5J',
  appVersion: version,
  capturedAt: new Date().toISOString(),
  currentStatus: 'installed-smoke-runner-ready-disposable-execution-pending',
  sourceReady: true,
  currentInstallerMatchCount: currentMatches.length,
  previousInstallerMatchCount: previousMatches.length,
  nodeVersion: process.version,
  currentHost: {
    isolatedRunnerAvailable: r5iEnvironment.execution.isolatedRunnerAvailable,
    existingProductRegistrationCount: r5iEnvironment.hostSafety.existingProductRegistrationCount,
    hostInstallerMutationAllowed: false,
  },
  execution: {
    installedArtifactSmokeExecuted: false,
    lifecycleResultImported: false,
    representativeRoutesVerified: false,
    txtJsonSaveReopenVerified: false,
    routePerformanceExported: false,
    screenshotsCaptured: false,
    releaseCandidate: false,
    promotionEligible: false,
    sourceUserContentIncluded: false,
  },
  expectedGuestEvidenceFiles: [
    'lifecycle-result.json',
    'installed-artifact-smoke.json',
    'installed-route-mount-evidence.json',
    'installed-route-performance-evidence.json',
    'installed-txt-save-reopen.jpg',
    'installed-json-save-reopen.jpg',
  ],
}, null, 2)}\n`)

console.log(`R5J installed-artifact smoke preflight captured: ${outputPath}`)
