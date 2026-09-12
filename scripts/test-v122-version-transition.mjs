import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'

const script = fs.readFileSync('scripts/apply-v122-version-transition.mjs', 'utf8').replace("import fs from 'node:fs'", '')
const listPath = 'scripts/apply-post-v116-m5-5-v1017-atomic-version-transition.mjs'
const listSource = fs.readFileSync(listPath, 'utf8')
const list = [...listSource.match(/const activeSharedFiles = \[([\s\S]*?)\]/)[1].matchAll(/'(shared\/[^']+)'/g)].map(m => m[1])
function fixture() {
  const files = new Map(list.map(file => [file, JSON.stringify({ appVersion: '1.0.21', nextStage: 'V1.0.21-UNSIGNED-PATCH-RELEASE', preserved: 'historical-v1.0.21' }, null, 2)]))
  files.set(listPath, listSource)
  files.set('package.json', '{"version": "1.0.21"}')
  files.set('package-lock.json', '{"version": "1.0.21", "packages": {"": {"version": "1.0.21"}}}')
  files.set('src-tauri/tauri.conf.json', '{"version": "1.0.21"}')
  files.set('src-tauri/Cargo.toml', 'version = "1.0.21"')
  files.set('src-tauri/Cargo.lock', 'name = "tauri-app"\nversion = "1.0.21"\n')
  files.set('shared/development-version-policy.json', JSON.stringify({ publicVersion: '1.0.21', publicTag: 'v1.0.21', runtimeBaseVersion: '1.0.21', developmentTargetVersion: '1.0.22' }))
  files.set('shared/v1-community-release-policy.json', JSON.stringify({ appVersion: '1.0.21', gates: { githubReleasePublished: true }, patchValidation: { managedUpdaterUpgradePath: '1.0.20-to-1.0.21-passed' } }))
  return files
}
function run(files, args, writes) {
  vm.runInNewContext(script, { fs: { readFileSync: file => { if (!files.has(file)) throw new Error(`Missing ${file}`); return files.get(file) }, writeFileSync: (file, data) => writes.set(file, data) }, process: { argv: ['node', 'migration', ...args] }, console: { log() {} } })
}
test('dry run validates without writes', () => { const writes = new Map(); run(fixture(), [], writes); assert.equal(writes.size, 0) })
test('apply changes all 44 identities while preserving public and historical fields', () => {
  const writes = new Map(); run(fixture(), ['--apply'], writes)
  assert.equal(writes.size, 44)
  for (const file of list) { const item = JSON.parse(writes.get(file)); assert.equal(item.appVersion, '1.0.22'); assert.equal(item.preserved, 'historical-v1.0.21') }
  const development = JSON.parse(writes.get('shared/development-version-policy.json'))
  assert.equal(development.publicTag, 'v1.0.21'); assert.equal(development.runtimeBaseVersion, '1.0.22')
  const policy = JSON.parse(writes.get('shared/v1-community-release-policy.json'))
  assert.ok(Object.values(policy.gates).every(value => value === false))
  assert.equal(policy.candidate, null); assert.equal(policy.release, null)
  assert.equal(policy.patchValidation.managedUpdaterUpgradePath, '1.0.21-to-1.0.22-pending')
})
for (const scenario of ['late-contract-drift', 'unclosed-predecessor', 'wrong-baseline', 'unknown-argument']) {
  test(`${scenario} fails before any write`, () => {
    const files = fixture(); const writes = new Map()
    if (scenario === 'late-contract-drift') files.set(list.at(-1), '{"appVersion":"1.0.20"}')
    if (scenario === 'unclosed-predecessor') files.set('shared/v1-community-release-policy.json', '{}')
    if (scenario === 'wrong-baseline') files.set('shared/development-version-policy.json', '{}')
    assert.throws(() => run(files, scenario === 'unknown-argument' ? ['--force'] : ['--apply'], writes))
    assert.equal(writes.size, 0)
  })
}
