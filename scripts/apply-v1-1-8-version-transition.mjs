import fs from 'node:fs'
import assert from 'node:assert/strict'

const from = '1.1.7', to = '1.1.8', read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file)), changes = new Map()
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw Error('Only --apply is supported')
const replace = (file, pattern, value, count) => {
  const source = changes.get(file) ?? read(file)
  assert.equal([...source.matchAll(pattern)].length, count, 'Unexpected current identity: ' + file)
  changes.set(file, source.replace(pattern, value))
}
const list = read('scripts/apply-post-v116-m5-5-v1017-atomic-version-transition.mjs').match(/const activeSharedFiles = \[([\s\S]*?)\]/)[1]
const contracts = [...list.matchAll(/'(shared\/[^']+)'/g)].map(match => match[1])
assert.equal(contracts.length, 37); assert.equal(new Set(contracts).size, 37)
replace('package.json', /"version": "1\.1\.7"/g, '"version": "1.1.8"', 1)
const lock = json('package-lock.json')
assert.equal(lock.version, from); assert.equal(lock.packages[''].version, from)
lock.version = lock.packages[''].version = to
changes.set('package-lock.json', JSON.stringify(lock, null, 2) + '\n')
replace('src-tauri/tauri.conf.json', /"version": "1\.1\.7"/g, '"version": "1.1.8"', 1)
replace('src-tauri/Cargo.toml', /^version = "1\.1\.7"$/gm, 'version = "1.1.8"', 1)
replace('src-tauri/Cargo.lock', /(name = "tauri-app"\r?\nversion = ")1\.1\.7("\r?\n)/g, '$11.1.8$2', 1)
for (const file of contracts) {
  assert.equal(json(file).appVersion, from)
  replace(file, /"appVersion": "1\.1\.7"/g, '"appVersion": "1.1.8"', 1)
}
replace('shared/p1-final-capability-closure.json', /V1\.1\.7-UNSIGNED-PATCH-RELEASE/g, 'V1.1.8-UNSIGNED-PATCH-RELEASE', 1)
const development = json('shared/development-version-policy.json')
assert.equal(development.publicVersion, from); assert.equal(development.developmentTargetVersion, to)
Object.assign(development, { runtimeBaseVersion: to, currentStage: 'M8-44-v1.1.8-version-candidate',
  binaryVersionTransition: 'v1.1.8-quality-gate-pending', displayLabel: 'v1.1.8 搜索完整性候选 · 当前公开 v1.1.7',
  activeSlice: { id: 'v1.1.8-search-completeness', status: 'candidate-validation-pending', document: 'docs/V1_1_8_Installed_Release_Closure_2026-10-17.md' } })
changes.set('shared/development-version-policy.json', JSON.stringify(development, null, 2) + '\n')
const community = json('shared/v1-community-release-policy.json')
assert.equal(community.appVersion, from); assert.equal(community.gates.githubReleasePublished, true)
Object.assign(community, { appVersion: to, releaseCandidate: false, generatedAt: '2026-10-17',
  currentStatus: 'v1.1.8-community-release-quality-gate-pending',
  gates: Object.fromEntries(Object.keys(community.gates).map(key => [key, false])),
  patchValidation: { ...community.patchValidation, previousPublicVersion: from, previousEvidenceInheritedAsCurrent: false,
    fullInstalledLifecycleRerun: false, managedUpdaterUpgradePath: from + '-to-' + to + '-pending', scope: 'search-completeness' },
  targetRelease: { ...community.targetRelease, tag: 'v' + to, url: 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v' + to },
  candidate: null, release: null,
  releaseWarnings: [...new Set([...community.releaseWarnings, 'v1.1.7-to-v1.1.8-managed-update-observation-pending'])],
  nextAction: 'validate-and-build-v1.1.8-installers' })
changes.set('shared/v1-community-release-policy.json', JSON.stringify(community, null, 2) + '\n')
// This command performs only the bounded, mechanical identity transition.
// No historical evidence, source, README download or release asset is rewritten.
if (process.argv.includes('--apply')) for (const [file, content] of changes) fs.writeFileSync(file, content)
console.log(`${process.argv.includes('--apply') ? 'Applied' : 'Dry run'}: ${changes.size} current version files; published bytes and historical evidence unchanged.`)
