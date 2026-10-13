import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { expectedDevelopmentTarget } from './lib/development-target.mjs'

test('approved minor transition and ordinary patches reject arbitrary jumps', () => {
  assert.equal(expectedDevelopmentTarget('1.0.26', '1.1.0'), '1.1.0')
  assert.equal(expectedDevelopmentTarget('1.0.26', '2.0.0'), '1.0.27')
  assert.equal(expectedDevelopmentTarget('1.1.0', '1.1.1'), '1.1.1')
  assert.equal(expectedDevelopmentTarget('1.1.0', '1.2.0'), '1.1.1')
  assert.throws(() => expectedDevelopmentTarget('broken', '1.1.0'))
})
test('all runtime identities advance together without rewriting historical receipts', () => {
  const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
  const version = json('package.json').version
  assert.equal(version, '1.1.0')
  assert.equal(json('package-lock.json').version, version)
  assert.equal(json('package-lock.json').packages[''].version, version)
  assert.equal(json('src-tauri/tauri.conf.json').version, version)
  assert.ok(fs.readFileSync('src-tauri/Cargo.toml','utf8').includes(`version = "${version}"`))
  assert.ok(fs.readFileSync('src-tauri/Cargo.lock','utf8').includes(`name = "tauri-app"\nversion = "${version}"`))
  const list = fs.readFileSync('scripts/apply-post-v116-m5-5-v1017-atomic-version-transition.mjs','utf8')
    .match(/const activeSharedFiles = \[([\s\S]*?)\]/)[1]
  const files = [...list.matchAll(/'(shared\/[^']+)'/g)].map(m=>m[1])
  assert.equal(files.length,37)
  for (const file of files) assert.equal(json(file).appVersion, version, file)
  assert.equal(json('docs/evidence/v1.0.26-release/release-receipt.json').release.tag, 'v1.0.26')
  assert.equal(json('shared/v1-community-release-policy.json').patchValidation.previousPublicVersion, '1.0.26')
})
