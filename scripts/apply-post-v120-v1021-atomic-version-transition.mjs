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

replaceExact('package.json', /"version": "1\.0\.20"/g, '"version": "1.0.21"', 1)
replaceExact('package-lock.json', /"version": "1\.0\.20"/g, '"version": "1.0.21"', 2)
replaceExact('src-tauri/tauri.conf.json', /"version": "1\.0\.20"/g, '"version": "1.0.21"', 1)
replaceExact('src-tauri/Cargo.toml', /^version = "1\.0\.20"$/gm, 'version = "1.0.21"', 1)
replaceExact('src-tauri/Cargo.lock', /(name = "tauri-app"\r?\nversion = ")1\.0\.20("\r?\n)/g, '$11.0.21$2', 1)

for (const file of activeSharedFiles) {
  if (json(file).appVersion !== '1.0.20') throw new Error(`${file}: expected appVersion 1.0.20`)
  replaceExact(file, /"appVersion": "1\.0\.20"/g, '"appVersion": "1.0.21"', 1)
}
replaceExact('shared/p1-final-capability-closure.json', /"nextStage": "V1\.0\.20-UNSIGNED-PATCH-RELEASE"/g, '"nextStage": "V1.0.21-UNSIGNED-PATCH-RELEASE"', 1)

const development = json('shared/development-version-policy.json')
Object.assign(development, {
  runtimeBaseVersion: '1.0.21',
  releaseCandidate: false,
  currentStage: 'M8-10-v1.0.21-graph-interaction-polish-candidate',
  binaryVersionTransition: 'v1.0.21-quality-gate-pending',
  displayLabel: 'v1.0.21 图谱交互精修候选 · 当前公开 v1.0.20 · M8-10',
})
write('shared/development-version-policy.json', `${JSON.stringify(development, null, 2)}\n`)

const community = json('shared/v1-community-release-policy.json')
Object.assign(community, {
  appVersion: '1.0.21',
  releaseCandidate: false,
  generatedAt: '2026-09-01',
  currentStatus: 'v1.0.21-community-release-quality-gate-pending',
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
    previousPublicVersion: '1.0.20',
    previousInstalledLifecycleEvidenceVersion: '1.0.5',
    previousEvidenceInheritedAsCurrent: false,
    fullInstalledLifecycleRerun: false,
    managedUpdaterFirstRelease: false,
    v1_0_4RequiresManualMigration: true,
    managedUpdaterUpgradePath: '1.0.20-to-1.0.21-pending',
    scope: 'post-v1.0.20-knowledge-graph-zoom-detail-controls-and-theme-polish',
  },
  targetRelease: {
    tag: 'v1.0.21',
    url: 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.21',
    assetMode: 'managed-nsis-msi-with-sha256',
  },
  candidate: null,
  release: null,
  releaseWarnings: [
    'windows-unknown-publisher-or-smartscreen-may-appear',
    'v1.0.4-users-must-install-v1.0.5-manually-once',
    'v1.0.20-to-v1.0.21-managed-update-observation-pending',
    'download-only-from-official-github-release',
    'verify-published-sha256-before-install',
  ],
  nextAction: 'pass-v1.0.21-quality-gate-and-build-real-candidate-installers',
})
write('shared/v1-community-release-policy.json', `${JSON.stringify(community, null, 2)}\n`)

console.log(`v1.0.21 atomic transition applied: package/Cargo/Tauri, ${activeSharedFiles.length} active shared contracts and candidate policies now identify v1.0.21; public v1.0.20 facts remain frozen.`)
