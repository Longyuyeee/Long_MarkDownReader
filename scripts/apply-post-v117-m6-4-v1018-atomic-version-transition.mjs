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

const previousTransition = read('scripts/apply-post-v116-m5-5-v1017-atomic-version-transition.mjs')
const activeListSource = previousTransition.match(/const activeSharedFiles = \[(.*?)\]\r?\n\r?\n/s)?.[1] ?? ''
const activeSharedFiles = [...activeListSource.matchAll(/'(shared\/[^']+\.json)'/g)].map(match => match[1])
if (activeSharedFiles.length !== 37 || new Set(activeSharedFiles).size !== 37) throw new Error(`expected 37 canonical active shared contracts, found ${activeSharedFiles.length}`)

replaceExact('package.json', /"version": "1\.0\.17"/g, '"version": "1.0.18"', 1)
replaceExact('package-lock.json', /"version": "1\.0\.17"/g, '"version": "1.0.18"', 2)
replaceExact('src-tauri/tauri.conf.json', /"version": "1\.0\.17"/g, '"version": "1.0.18"', 1)
replaceExact('src-tauri/Cargo.toml', /^version = "1\.0\.17"$/gm, 'version = "1.0.18"', 1)
replaceExact('src-tauri/Cargo.lock', /(name = "tauri-app"\r?\nversion = ")1\.0\.17("\r?\n)/g, '$11.0.18$2', 1)

for (const file of activeSharedFiles) {
  if (json(file).appVersion !== '1.0.17') throw new Error(`${file}: expected appVersion 1.0.17`)
  replaceExact(file, /"appVersion": "1\.0\.17"/g, '"appVersion": "1.0.18"', 1)
}

const development = json('shared/development-version-policy.json')
Object.assign(development, {
  runtimeBaseVersion: '1.0.18',
  releaseCandidate: false,
  currentStage: 'M6-4-v1.0.18-atomic-version-transition-and-candidate-packaging',
  binaryVersionTransition: 'v1.0.18-quality-gate-pending',
  displayLabel: 'v1.0.18 候选质量门与打包中 · 当前公开 v1.0.17 · M6-4',
})
write('shared/development-version-policy.json', `${JSON.stringify(development, null, 2)}\n`)

const community = json('shared/v1-community-release-policy.json')
Object.assign(community, {
  appVersion: '1.0.18',
  releaseCandidate: false,
  generatedAt: '2026-08-31',
  currentStatus: 'v1.0.18-community-release-quality-gate-pending',
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
    githubReleasePublished: false
  },
  patchValidation: {
    previousPublicVersion: '1.0.17',
    previousInstalledLifecycleEvidenceVersion: '1.0.5',
    previousEvidenceInheritedAsCurrent: false,
    fullInstalledLifecycleRerun: false,
    managedUpdaterFirstRelease: false,
    v1_0_4RequiresManualMigration: true,
    managedUpdaterUpgradePath: '1.0.17-to-1.0.18-pending',
    scope: 'post-v1.0.17-bounded-graph-fullscreen-and-release-readiness-receipt-fixes'
  },
  targetRelease: {
    tag: 'v1.0.18',
    url: 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.18',
    assetMode: 'managed-nsis-msi-with-sha256'
  },
  candidate: null,
  release: null,
  releaseWarnings: [
    'windows-unknown-publisher-or-smartscreen-may-appear',
    'v1.0.4-users-must-install-v1.0.5-manually-once',
    'v1.0.17-to-v1.0.18-managed-update-observation-pending',
    'download-only-from-official-github-release',
    'verify-published-sha256-before-install'
  ],
  nextAction: 'pass-v1.0.18-quality-gate-and-build-real-candidate-installers'
})
write('shared/v1-community-release-policy.json', `${JSON.stringify(community, null, 2)}\n`)

console.log(`M6-4 atomic transition applied: package/Cargo/Tauri, ${activeSharedFiles.length} active shared contracts, development policy and community candidate now identify v1.0.18; public v1.0.17 facts remain frozen.`)
