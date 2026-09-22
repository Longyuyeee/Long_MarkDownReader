import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const planned = new Map()
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Only --apply is supported')
const write = (file, value) => planned.set(file, value)
const replaceExact = (file, pattern, replacement, expectedCount) => {
  const source = planned.get(file) ?? read(file)
  const matches = source.match(pattern) ?? []
  if (matches.length !== expectedCount) throw new Error(`${file}: expected ${expectedCount} matches, found ${matches.length}`)
  write(file, source.replace(pattern, replacement))
}

const previousTransition = read('scripts/apply-post-v116-m5-5-v1017-atomic-version-transition.mjs')
const activeListSource = previousTransition.match(/const activeSharedFiles = \[(.*?)\]\r?\n\r?\n/s)?.[1] ?? ''
const activeSharedFiles = [...activeListSource.matchAll(/'(shared\/[^']+\.json)'/g)].map(match => match[1])
if (activeSharedFiles.length !== 37 || new Set(activeSharedFiles).size !== 37) throw new Error(`expected 37 canonical active shared contracts, found ${activeSharedFiles.length}`)

replaceExact('package.json', /"version": "1\.0\.22"/g, '"version": "1.0.23"', 1)
replaceExact('package-lock.json', /"version": "1\.0\.22"/g, '"version": "1.0.23"', 2)
replaceExact('src-tauri/tauri.conf.json', /"version": "1\.0\.22"/g, '"version": "1.0.23"', 1)
replaceExact('src-tauri/Cargo.toml', /^version = "1\.0\.22"$/gm, 'version = "1.0.23"', 1)
replaceExact('src-tauri/Cargo.lock', /(name = "tauri-app"\r?\nversion = ")1\.0\.22("\r?\n)/g, '$11.0.23$2', 1)

for (const file of activeSharedFiles) {
  if (json(file).appVersion !== '1.0.22') throw new Error(`${file}: expected appVersion 1.0.22`)
  replaceExact(file, /"appVersion": "1\.0\.22"/g, '"appVersion": "1.0.23"', 1)
}
replaceExact('shared/p1-final-capability-closure.json', /"nextStage": "V1\.0\.22-UNSIGNED-PATCH-RELEASE"/g, '"nextStage": "V1.0.23-UNSIGNED-PATCH-RELEASE"', 1)

const development = json('shared/development-version-policy.json')
if (development.publicVersion !== '1.0.22' || development.runtimeBaseVersion !== '1.0.22' || development.developmentTargetVersion !== '1.0.23') throw new Error('Unexpected development baseline')
Object.assign(development, {
  runtimeBaseVersion: '1.0.23',
  releaseCandidate: false,
  currentStage: 'M8-18-v1.0.23-version-candidate',
  binaryVersionTransition: 'v1.0.23-quality-gate-pending',
  displayLabel: 'v1.0.23 版本身份修复候选 · 当前公开 v1.0.22',
  activeSlice: { id: 'v1.0.23-version-identity', status: 'runtime-transitioned-candidate-validation-pending', document: 'docs/V1_0_23_Unsigned_Community_Release_Audit_2026-09-23.md' },
})
write('shared/development-version-policy.json', `${JSON.stringify(development, null, 2)}\n`)

const community = json('shared/v1-community-release-policy.json')
if (community.appVersion !== '1.0.22' || community.gates?.githubReleasePublished !== true || community.patchValidation?.managedUpdaterUpgradePath !== '1.0.21-to-1.0.22-passed') throw new Error('Predecessor release/update must be closed')
Object.assign(community, {
  appVersion: '1.0.23',
  releaseCandidate: false,
  generatedAt: '2026-09-23',
  currentStatus: 'v1.0.23-community-release-quality-gate-pending',
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
    previousPublicVersion: '1.0.22',
    previousInstalledLifecycleEvidenceVersion: '1.0.5',
    previousEvidenceInheritedAsCurrent: false,
    fullInstalledLifecycleRerun: false,
    managedUpdaterFirstRelease: false,
    v1_0_4RequiresManualMigration: true,
    managedUpdaterUpgradePath: '1.0.22-to-1.0.23-pending',
    scope: 'runtime-version-identity-and-release-page-state',
  },
  targetRelease: {
    tag: 'v1.0.23',
    url: 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.23',
    assetMode: 'managed-nsis-msi-with-sha256',
  },
  candidate: null,
  release: null,
  releaseWarnings: [
    'windows-unknown-publisher-or-smartscreen-may-appear',
    'v1.0.4-users-must-install-v1.0.5-manually-once',
    'v1.0.22-to-v1.0.23-managed-update-observation-pending',
    'download-only-from-official-github-release',
    'verify-published-sha256-before-install',
  ],
  nextAction: 'pass-v1.0.23-quality-gate-and-build-real-candidate-installers',
})
write('shared/v1-community-release-policy.json', `${JSON.stringify(community, null, 2)}\n`)

for (const [file, content] of planned) {
  if (process.argv.includes('--apply')) fs.writeFileSync(file, content)
}
console.log(`${process.argv.includes('--apply') ? 'Applied' : 'Dry run'}: ${planned.size} version identity files; public v1.0.22 remains frozen.`)
