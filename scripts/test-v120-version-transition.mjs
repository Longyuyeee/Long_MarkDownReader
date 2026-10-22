import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { expectedDevelopmentTarget } from './lib/development-target.mjs'

test('approved 1.2.0 transition retains 1.1.37 and preserves patch defaults', () => {
  assert.equal(expectedDevelopmentTarget('1.1.37', '1.2.0'), '1.2.0')
  assert.equal(expectedDevelopmentTarget('1.1.37', '1.1.38'), '1.1.38')
  assert.equal(expectedDevelopmentTarget('1.1.36', '1.2.0'), '1.1.37')
  assert.equal(expectedDevelopmentTarget('1.2.0', '1.2.1'), '1.2.1')
  assert.equal(expectedDevelopmentTarget('1.0.26', '1.1.0'), '1.1.0')
})
test('minor release keeps inherited installer workflows and current PDF resume checks enabled', () => {
  for (const file of ['.github/workflows/community-release-publish.yml', '.github/workflows/v1-1-0-installer-review.yml', 'scripts/capture-r5j-installed-artifact-smoke.mjs']) {
    const source = fs.readFileSync(file, 'utf8')
    assert.ok(source.includes('1.2.0'), file)
    assert.ok(source.includes('installed-v1137') || source.includes('runInstalledV1137') || (file.endsWith('installer-review.yml') && source.includes('capture-r5j-installed-artifact-smoke.mjs')), file)
  }
  const policy = JSON.parse(fs.readFileSync('shared/v1-community-release-policy.json', 'utf8'))
  assert.equal(policy.patchValidation.previousPublicVersion, '1.1.37')
})
