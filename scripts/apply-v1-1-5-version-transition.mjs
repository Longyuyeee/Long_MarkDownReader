import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const changes = new Map()
const replace = (file, pattern, value, expected) => {
  const source = changes.get(file) ?? read(file)
  if ([...source.matchAll(pattern)].length !== expected) throw Error(`Unexpected version identity: ${file}`)
  changes.set(file, source.replace(pattern, value))
}
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw Error('Only --apply is supported')
const list = read('scripts/apply-post-v116-m5-5-v1017-atomic-version-transition.mjs').match(/const activeSharedFiles = \[([\s\S]*?)\]/)[1]
const contracts = [...list.matchAll(/'(shared\/[^']+)'/g)].map(match => match[1])
if (contracts.length !== 37 || new Set(contracts).size !== 37) throw Error('Canonical contract list changed')
replace('package.json', /"version": "1\.1\.4"/g, '"version": "1.1.5"', 1)
// Dependency versions with the same number are unrelated to the application.
const lock = json('package-lock.json')
if (lock.version !== '1.1.4' || lock.packages[''].version !== '1.1.4') throw Error('Lockfile baseline changed')
lock.version = lock.packages[''].version = '1.1.5'
changes.set('package-lock.json', JSON.stringify(lock, null, 2) + '\n')
replace('src-tauri/tauri.conf.json', /"version": "1\.1\.4"/g, '"version": "1.1.5"', 1)
replace('src-tauri/Cargo.toml', /^version = "1\.1\.4"$/gm, 'version = "1.1.5"', 1)
replace('src-tauri/Cargo.lock', /(name = "tauri-app"\r?\nversion = ")1\.1\.4("\r?\n)/g, '$11.1.5$2', 1)
for (const file of contracts) {
  if (json(file).appVersion !== '1.1.4') throw Error(`Unexpected contract baseline: ${file}`)
  replace(file, /"appVersion": "1\.1\.4"/g, '"appVersion": "1.1.5"', 1)
}
replace('shared/p1-final-capability-closure.json', /V1\.1\.4-UNSIGNED-PATCH-RELEASE/g, 'V1.1.5-UNSIGNED-PATCH-RELEASE', 1)
const development = json('shared/development-version-policy.json')
if (development.publicVersion !== '1.1.4' || development.developmentTargetVersion !== '1.1.5') throw Error('Public baseline changed')
Object.assign(development, {
  runtimeBaseVersion: '1.1.5', currentStage: 'M8-38-v1.1.5-version-candidate',
  binaryVersionTransition: 'v1.1.5-quality-gate-pending',
  displayLabel: 'v1.1.5 安全导入与搜索一致性候选 · 当前公开 v1.1.4',
  activeSlice: { id: 'v1.1.5-foundation-hardening', status: 'candidate-validation-pending', document: 'docs/V1_1_5_Unsigned_Community_Release_Audit_2026-10-15.md' },
})
changes.set('shared/development-version-policy.json', JSON.stringify(development, null, 2) + '\n')
const community = json('shared/v1-community-release-policy.json')
Object.assign(community, {
  appVersion: '1.1.5', releaseCandidate: false, generatedAt: '2026-10-15',
  currentStatus: 'v1.1.5-community-release-quality-gate-pending',
  gates: Object.fromEntries(Object.keys(community.gates).map(key => [key, false])),
  patchValidation: { ...community.patchValidation, previousPublicVersion: '1.1.4', previousEvidenceInheritedAsCurrent: false, fullInstalledLifecycleRerun: false, managedUpdaterUpgradePath: '1.1.4-to-1.1.5-pending', scope: 'safe-import-and-search-consistency' },
  targetRelease: { ...community.targetRelease, tag: 'v1.1.5', url: 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.1.5' },
  candidate: null, release: null,
  // Keep unresolved predecessor observations; a new release never proves them passed.
  releaseWarnings: [...new Set([...community.releaseWarnings, 'v1.1.4-to-v1.1.5-managed-update-observation-pending'])],
  nextAction: 'validate-and-build-v1.1.5-installers',
})
changes.set('shared/v1-community-release-policy.json', JSON.stringify(community, null, 2) + '\n')
if (process.argv.includes('--apply')) for (const [file, content] of changes) fs.writeFileSync(file, content)
console.log(`${process.argv.includes('--apply') ? 'Applied' : 'Dry run'}: ${changes.size} current version files; historical release evidence preserved.`)
