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
replace('package.json', /"version": "1\.2\.29"/g, '"version": "1.2.30"', 1)
// Dependency versions with the same number are unrelated to the application.
const lock = json('package-lock.json')
if (lock.version !== '1.2.29' || lock.packages[''].version !== '1.2.29') throw Error('Lockfile baseline changed')
lock.version = lock.packages[''].version = '1.2.30'
changes.set('package-lock.json', JSON.stringify(lock, null, 2) + '\n')
replace('src-tauri/tauri.conf.json', /"version": "1\.2\.29"/g, '"version": "1.2.30"', 1)
replace('src-tauri/Cargo.toml', /^version = "1\.2\.29"$/gm, 'version = "1.2.30"', 1)
replace('src-tauri/Cargo.lock', /(name = "tauri-app"\r?\nversion = ")1\.2\.29("\r?\n)/g, '$11.2.30$2', 1)
for (const file of contracts) {
  if (json(file).appVersion !== '1.2.29') throw Error(`Unexpected contract baseline: ${file}`)
  replace(file, /"appVersion": "1\.2\.29"/g, '"appVersion": "1.2.30"', 1)
}
replace('shared/p1-final-capability-closure.json', /V1\.2\.29-UNSIGNED-PATCH-RELEASE/g, 'V1.2.30-UNSIGNED-PATCH-RELEASE', 1)
const development = json('shared/development-version-policy.json')
if (development.publicVersion !== '1.2.29' || development.developmentTargetVersion !== '1.2.30') throw Error('Public baseline changed')
Object.assign(development, {
  runtimeBaseVersion: '1.2.30', currentStage: 'M8-164-v1.2.30-toml-field-copy-candidate',
  binaryVersionTransition: 'v1.2.30-quality-gate-pending',
  displayLabel: 'v1.2.30 TOML 字段复制候选 · 当前公开 v1.2.29',
  activeSlice: { id: 'v1.2.30-toml-field-copy', status: 'candidate-validation-pending', document: 'docs/V1_2_30_Unsigned_Community_Release_Audit_2026-10-25.md' },
})
changes.set('shared/development-version-policy.json', JSON.stringify(development, null, 2) + '\n')
const community = json('shared/v1-community-release-policy.json')
Object.assign(community, {
  appVersion: '1.2.30', releaseCandidate: false, generatedAt: '2026-10-25',
  currentStatus: 'v1.2.30-community-release-quality-gate-pending',
  gates: Object.fromEntries(Object.keys(community.gates).map(key => [key, false])),
  patchValidation: { ...community.patchValidation, previousPublicVersion: '1.2.29', previousEvidenceInheritedAsCurrent: false, fullInstalledLifecycleRerun: false, managedUpdaterUpgradePath: '1.2.29-to-1.2.30-pending', scope: 'toml-field-copy' },
  targetRelease: { ...community.targetRelease, tag: 'v1.2.30', url: 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.2.30' },
  candidate: null, release: null,
  // Keep unresolved predecessor observations; a new release never proves them passed.
  releaseWarnings: [...new Set([...community.releaseWarnings, 'v1.2.29-to-v1.2.30-managed-update-observation-pending'])],
  nextAction: 'validate-and-build-v1.2.30-installers',
})
changes.set('shared/v1-community-release-policy.json', JSON.stringify(community, null, 2) + '\n')
if (process.argv.includes('--apply')) for (const [file, content] of changes) fs.writeFileSync(file, content)
console.log(`${process.argv.includes('--apply') ? 'Applied' : 'Dry run'}: ${changes.size} current version files; historical release evidence preserved.`)
