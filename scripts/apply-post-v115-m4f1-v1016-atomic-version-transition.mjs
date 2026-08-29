import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const write = (file, value) => fs.writeFileSync(file, value)
const replaceExact = (file, pattern, replacement, expectedCount) => {
  const source = read(file)
  const matches = source.match(pattern) ?? []
  if (matches.length !== expectedCount) throw new Error(`${file}: expected ${expectedCount} version matches, found ${matches.length}`)
  write(file, source.replace(pattern, replacement))
}

const freeze = json('shared/post-v115-m4f0-v1016-release-freeze-entry-audit-policy.json')
const evidence = json('docs/evidence/post-v115-m4f0-v1016-release-freeze-entry-audit/freeze-entry.json')
const expectedFiles = [...evidence.atomicVersionScope.atomicVersionFiles].sort()
if (freeze.candidateVersion !== '1.0.16' || freeze.publicVersion !== '1.0.15' || expectedFiles.length !== 44) {
  throw new Error('M4F-0 frozen version scope is not the expected 44-file v1.0.16 transition')
}

replaceExact('package.json', /"version": "1\.0\.15"/g, '"version": "1.0.16"', 1)
replaceExact('package-lock.json', /"version": "1\.0\.15"/g, '"version": "1.0.16"', 2)
replaceExact('src-tauri/tauri.conf.json', /"version": "1\.0\.15"/g, '"version": "1.0.16"', 1)
replaceExact('src-tauri/Cargo.toml', /^version = "1\.0\.15"$/gm, 'version = "1.0.16"', 1)
replaceExact('src-tauri/Cargo.lock', /(name = "tauri-app"\r?\nversion = ")1\.0\.15("\r?\n)/g, '$11.0.16$2', 1)

for (const file of evidence.atomicVersionScope.activeSharedFiles) {
  const value = json(file)
  if (value.appVersion !== '1.0.15') throw new Error(`${file}: expected appVersion 1.0.15`)
  replaceExact(file, /"appVersion": "1\.0\.15"/g, '"appVersion": "1.0.16"', 1)
}

const development = json('shared/development-version-policy.json')
Object.assign(development, {
  runtimeBaseVersion: '1.0.16',
  releaseCandidate: false,
  currentStage: 'M4F-2-v1.0.16-candidate-quality-gate-and-runtime-smoke',
  binaryVersionTransition: 'v1.0.16-quality-gate-pending',
  displayLabel: 'v1.0.16 候选准备中 · 当前公开 v1.0.15',
})
write('shared/development-version-policy.json', `${JSON.stringify(development, null, 2)}\n`)

const community = json('shared/v1-community-release-policy.json')
Object.assign(community, {
  appVersion: '1.0.16',
  releaseCandidate: false,
  generatedAt: '2026-08-30',
  currentStatus: 'v1.0.16-community-release-quality-gate-pending',
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
    previousPublicVersion: '1.0.15',
    previousInstalledLifecycleEvidenceVersion: '1.0.5',
    previousEvidenceInheritedAsCurrent: false,
    fullInstalledLifecycleRerun: false,
    managedUpdaterFirstRelease: false,
    v1_0_4RequiresManualMigration: true,
    managedUpdaterUpgradePath: '1.0.15-to-1.0.16-pending',
    scope: 'post-v1.0.15-professional-capability-cross-format-workflow-and-release-freeze',
  },
  targetRelease: {
    tag: 'v1.0.16',
    url: 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.16',
    assetMode: 'managed-nsis-msi-with-sha256',
  },
  candidate: null,
  release: null,
  releaseWarnings: [
    'windows-unknown-publisher-or-smartscreen-may-appear',
    'v1.0.4-users-must-install-v1.0.5-manually-once',
    'v1.0.15-to-v1.0.16-managed-update-observation-pending',
    'download-only-from-official-github-release',
    'verify-published-sha256-before-install',
  ],
  nextAction: 'pass-v1.0.16-quality-gate-and-current-candidate-runtime-smoke',
})
write('shared/v1-community-release-policy.json', `${JSON.stringify(community, null, 2)}\n`)

for (const file of freeze.historicalVersionPins) {
  if (json(file).appVersion !== '1.0.15') throw new Error(`${file}: historical version pin was modified`)
}

console.log(`M4F-1 atomic transition applied: ${expectedFiles.length} frozen version files now target v1.0.16; five historical pins remain at v1.0.15.`)
