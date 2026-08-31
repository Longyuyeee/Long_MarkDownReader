import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const write = (file, value) => fs.writeFileSync(file, value)
const replaceExact = (file, pattern, replacement, expectedCount) => {
  const source = read(file)
  const matches = source.match(pattern) ?? []
  if (matches.length !== expectedCount) throw new Error(`${file}: expected ${expectedCount} matches, found ${matches.length}`)
  write(file, source.replace(pattern, replacement))
}

const activeSharedFiles = [
  'shared/desktop-startup-performance-policy.json',
  'shared/frontend-release-hardening-policy.json',
  'shared/g10-cross-format-graph-acceptance-policy.json',
  'shared/g11-installed-knowledge-pulse-policy.json',
  'shared/g12-consented-knowledge-observation-policy.json',
  'shared/g13-actionable-knowledge-guidance-policy.json',
  'shared/g14-installed-knowledge-guidance-policy.json',
  'shared/g15a-guided-remediation-routing-policy.json',
  'shared/g15b-consented-guidance-outcome-policy.json',
  'shared/g15c-installed-guidance-outcome-policy.json',
  'shared/g15d-guidance-observation-entry-policy.json',
  'shared/g15e-consented-real-library-session-policy.json',
  'shared/g15f-local-comparison-receipt-review-policy.json',
  'shared/g16-knowledge-isolation-action-queue-policy.json',
  'shared/g9-knowledge-graph-pulse-policy.json',
  'shared/p1-final-capability-closure.json',
  'shared/r5c-route-performance-smoke-policy.json',
  'shared/r5d-production-route-smoke-preflight-policy.json',
  'shared/r5e-runtime-route-smoke-policy.json',
  'shared/r5f-safe-tauri-runtime-policy.json',
  'shared/r5g-desktop-artifact-smoke-policy.json',
  'shared/r5h-current-installer-evidence-policy.json',
  'shared/r5i-isolated-install-lifecycle-policy.json',
  'shared/r5j-installed-artifact-smoke-policy.json',
  'shared/r5k-windows-matrix-handoff-policy.json',
  'shared/r5l-management-rollback-closure-policy.json',
  'shared/r5m-final-release-closure-policy.json',
  'shared/r5n-external-release-execution-policy.json',
  'shared/release-capability-matrix.json',
  'shared/safe-degradation-contract.json',
  'shared/windows-lifecycle-policy.json',
  'shared/windows-release-artifact-manifest.json',
  'shared/windows-release-notes-rollback-plan.json',
  'shared/windows-release-rc-promotion-gate.json',
  'shared/windows-release-readiness-policy.json',
  'shared/windows-release-signing-evidence.json',
  'shared/windows-release-vm-matrix-evidence.json',
]

replaceExact('package.json', /"version": "1\.0\.16"/g, '"version": "1.0.17"', 1)
replaceExact('package-lock.json', /"version": "1\.0\.16"/g, '"version": "1.0.17"', 2)
replaceExact('src-tauri/tauri.conf.json', /"version": "1\.0\.16"/g, '"version": "1.0.17"', 1)
replaceExact('src-tauri/Cargo.toml', /^version = "1\.0\.16"$/gm, 'version = "1.0.17"', 1)
replaceExact('src-tauri/Cargo.lock', /(name = "tauri-app"\r?\nversion = ")1\.0\.16("\r?\n)/g, '$11.0.17$2', 1)

for (const file of activeSharedFiles) {
  if (json(file).appVersion !== '1.0.16') throw new Error(`${file}: expected appVersion 1.0.16`)
  replaceExact(file, /"appVersion": "1\.0\.16"/g, '"appVersion": "1.0.17"', 1)
}

const development = json('shared/development-version-policy.json')
Object.assign(development, {
  runtimeBaseVersion: '1.0.17',
  releaseCandidate: false,
  currentStage: 'M5-5-v1.0.17-atomic-version-transition-and-candidate-packaging',
  binaryVersionTransition: 'v1.0.17-quality-gate-pending',
  displayLabel: 'v1.0.17 候选质量门与打包中 · 当前公开 v1.0.16 · M5-5',
})
write('shared/development-version-policy.json', `${JSON.stringify(development, null, 2)}\n`)

const community = json('shared/v1-community-release-policy.json')
Object.assign(community, {
  appVersion: '1.0.17',
  releaseCandidate: false,
  generatedAt: '2026-08-31',
  currentStatus: 'v1.0.17-community-release-quality-gate-pending',
  gates: {
    frontendBuildPassed: false,
    rustLockedCheckPassed: false,
    productionDependencyAuditPassed: false,
    msiBuilt: false,
    nsisBuilt: false,
    artifactHashesVerified: false,
    localRuntimeSmokePassed: false,
    installedLifecyclePassed: false,
    qualityGatePassed: false,
    githubReleasePublished: false,
  },
  patchValidation: {
    previousPublicVersion: '1.0.16',
    previousInstalledLifecycleEvidenceVersion: '1.0.5',
    previousEvidenceInheritedAsCurrent: false,
    fullInstalledLifecycleRerun: false,
    managedUpdaterFirstRelease: false,
    v1_0_4RequiresManualMigration: true,
    managedUpdaterUpgradePath: '1.0.16-to-1.0.17-pending',
    scope: 'post-v1.0.16-bounded-odp-body-copy-and-release-readiness-fixes',
  },
  targetRelease: {
    tag: 'v1.0.17',
    url: 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.17',
    assetMode: 'managed-nsis-msi-with-sha256',
  },
  candidate: null,
  release: null,
  releaseWarnings: [
    'windows-unknown-publisher-or-smartscreen-may-appear',
    'v1.0.4-users-must-install-v1.0.5-manually-once',
    'v1.0.16-to-v1.0.17-managed-update-observation-pending',
    'download-only-from-official-github-release',
    'verify-published-sha256-before-install',
  ],
  nextAction: 'pass-v1.0.17-quality-gate-and-build-real-candidate-installers',
})
write('shared/v1-community-release-policy.json', `${JSON.stringify(community, null, 2)}\n`)

console.log(`M5-5 atomic transition applied: package/Cargo/Tauri, ${activeSharedFiles.length} active shared contracts, development policy and community candidate now identify v1.0.17; public v1.0.16 facts remain frozen.`)
